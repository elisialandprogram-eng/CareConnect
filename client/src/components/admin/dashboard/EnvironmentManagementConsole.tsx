import { useState } from "react";
import { formatInCurrency } from "@/lib/currency";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle, Eye, Trash2, Clock, User, ShieldAlert, CheckCircle2,
  Database, Activity, Sprout, RefreshCw, Copy, EyeOff, Stethoscope,
  BarChart3, Shield, Search, Server, Calendar, Wallet, FileText,
  BookOpen, ChevronRight, Info, Circle,
} from "lucide-react";
import { SeedUatTool } from "./SeedUatTool";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ResetProfile {
  id: string;
  name: string;
  description: string;
  affectedTables: string[];
  protected: string[];
  color: "destructive" | "amber" | "blue" | "violet" | "emerald";
}

interface ResetCounts {
  patients: number; providers: number; appointments: number; payments: number;
  wallets: number; notifications: number; reviews: number; documents: number;
  messages: number; medicalRecords: number;
}

interface ProfilePreview {
  profileId: string;
  totalRows: number;
  tableCounts: Record<string, number>;
}

interface HistoryRow {
  id: string; action: string;
  details: { counts?: ResetCounts; durationMs?: number; errors?: string[]; rowsDeleted?: number; profileId?: string } | null;
  created_at: string; first_name: string | null; last_name: string | null; email: string | null;
}

interface SnapshotData {
  capturedAt: string;
  recordCounts: Record<string, number>;
  configCounts: Record<string, number>;
  adminUsers: Array<{ id: string; email: string; role: string }>;
}

interface TestDataReport {
  detectedAt: string;
  seededUsers: Array<{ id: string; email: string; role: string; createdAt: string }>;
  testProviders: Array<{ id: string; userId: string; clinicName: string | null; status: string }>;
  totalTestUsers: number; totalTestProviders: number;
  classification: { safeToDelete: number; reviewRequired: number; protected: number };
}

interface PlatformStats {
  generatedAt: string;
  users: { total: number; patients: number; providers: number; admins: number };
  appointments: { total: number; upcoming: number; completed: number; cancelled: number };
  financial: { totalPayments: number; totalWalletBalance: string; totalProviderEarnings: string };
  content: { services: number; categories: number; reviews: number; supportTickets: number };
  notifications: { queued: number; delivered: number };
  system: { auditLogEntries: number; activeJobs: number };
}

interface DbHealthData {
  topTables: Array<{ table: string; liveRows: number; deadRows: number; totalSizeBytes: number; indexSizeBytes: number; lastAutovacuum: string | null; lastAnalyze: string | null }>;
  cacheHitRate: { heap: number; index: number };
  unusedIndexes: Array<{ table: string; index: string; scans: number }>;
  totalDatabaseSizeBytes: number;
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function fmtBytes(b: number): string {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1_024) return `${(b / 1_024).toFixed(1)} KB`;
  return `${b} B`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const profileColorClass: Record<string, string> = {
  destructive: "border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/20",
  amber:       "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20",
  blue:        "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20",
  violet:      "border-violet-300 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/20",
  emerald:     "border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20",
};

const profileBadgeClass: Record<string, string> = {
  destructive: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  amber:       "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  blue:        "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  violet:      "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  emerald:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
};

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub?: string; icon?: React.ElementType }) {
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">{typeof value === "number" ? fmt(value) : value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ── Overview / Snapshot tab ────────────────────────────────────────────────────

function OverviewTab() {
  const { data: snapData, isFetching, refetch } = useQuery<{ snapshot: SnapshotData }>({
    queryKey: ["/api/admin/dev/env/snapshot"],
    refetchOnWindowFocus: false,
  });
  const { data: statsData } = useQuery<{ stats: PlatformStats }>({
    queryKey: ["/api/admin/dev/env/platform-stats"],
    refetchOnWindowFocus: false,
  });

  const snap = snapData?.snapshot;
  const stats = statsData?.stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">Environment Snapshot</h3>
          <p className="text-sm text-muted-foreground">
            {snap ? `Captured at ${new Date(snap.capturedAt).toLocaleString()}` : "Live platform statistics and configuration overview."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-snapshot">
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {stats && (
        <>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Users</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Users" value={stats.users.total} icon={User} />
              <StatCard label="Patients" value={stats.users.patients} icon={User} />
              <StatCard label="Providers" value={stats.users.providers} icon={Stethoscope} />
              <StatCard label="Admins / Staff" value={stats.users.admins} icon={Shield} />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Appointments</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total" value={stats.appointments.total} icon={Calendar} />
              <StatCard label="Upcoming" value={stats.appointments.upcoming} />
              <StatCard label="Completed" value={stats.appointments.completed} />
              <StatCard label="Cancelled" value={stats.appointments.cancelled} />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Platform Content</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Services" value={stats.content.services} icon={BookOpen} />
              <StatCard label="Categories" value={stats.content.categories} />
              <StatCard label="Reviews" value={stats.content.reviews} />
              <StatCard label="Support Tickets" value={stats.content.supportTickets} />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Financial</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Total Payments" value={stats.financial.totalPayments} icon={Wallet} />
              <StatCard label="Wallet Balance (USD)" value={formatInCurrency(parseFloat(stats.financial.totalWalletBalance), "USD")} />
              <StatCard label="Provider Earnings" value={formatInCurrency(parseFloat(stats.financial.totalProviderEarnings), "USD")} />
            </div>
          </div>
        </>
      )}

      {snap && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-600" />
              Configuration Protection — Protected Assets
            </CardTitle>
            <CardDescription>These items are preserved across all reset operations.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(snap.configCounts).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                  <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                  <Badge variant="outline" className="text-xs font-mono text-emerald-700 dark:text-emerald-400 border-emerald-300">{val}</Badge>
                </div>
              ))}
            </div>

            {snap.adminUsers.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Admin Accounts (always protected)</p>
                <div className="space-y-1">
                  {snap.adminUsers.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 py-1 px-3 rounded-md bg-muted/40 text-sm">
                      <Shield className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <span className="truncate font-mono text-xs">{a.email}</span>
                      <Badge variant="secondary" className="ml-auto text-xs capitalize shrink-0">{a.role.replace(/_/g, " ")}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Reset Profiles tab ─────────────────────────────────────────────────────────

function ResetProfilesTab() {
  const { toast } = useToast();
  const [selectedProfile, setSelectedProfile] = useState<ResetProfile | null>(null);
  const [preview, setPreview] = useState<ProfilePreview | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [lastResult, setLastResult] = useState<{ profileId: string; rowsDeleted: number; durationMs: number; errors: string[] } | null>(null);

  const { data: profilesData } = useQuery<{ profiles: ResetProfile[] }>({
    queryKey: ["/api/admin/dev/reset/profiles"],
  });
  const profiles = profilesData?.profiles ?? [];

  const previewMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const res = await apiRequest("POST", "/api/admin/dev/reset/profile/preview", { profileId });
      return res.json() as Promise<{ preview: ProfilePreview }>;
    },
    onSuccess: (data) => {
      setPreview(data.preview);
      setUnderstood(false);
      setConfirmText("");
      toast({ title: "Preview ready", description: `${data.preview.totalRows} rows will be affected.` });
    },
    onError: (err: Error) => toast({ title: "Preview failed", description: err.message, variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/dev/reset/profile/execute", {
        profileId: selectedProfile!.id,
        confirm: confirmText,
        understood,
      });
      return res.json() as Promise<{ success: boolean; profileId: string; rowsDeleted: number; durationMs: number; errors: string[] }>;
    },
    onSuccess: (data) => {
      setLastResult({ profileId: data.profileId, rowsDeleted: data.rowsDeleted, durationMs: data.durationMs, errors: data.errors });
      setPreview(null); setUnderstood(false); setConfirmText("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dev/reset/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dev/env/snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dev/env/platform-stats"] });
      toast({ title: "Profile reset complete", description: `${data.rowsDeleted} rows removed in ${data.durationMs}ms.` });
    },
    onError: (err: Error) => toast({ title: "Reset failed", description: err.message, variant: "destructive" }),
  });

  const expectedPhrase = selectedProfile ? `RESET ${selectedProfile.id.toUpperCase()}` : "";
  const canExecute = understood && (confirmText === expectedPhrase || confirmText === "RESET DATABASE") && !!preview && !executeMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-base">Reset Profiles</h3>
        <p className="text-sm text-muted-foreground">Select a targeted reset profile. Each profile shows affected tables and a dry-run preview before any data is deleted.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => { setSelectedProfile(p); setPreview(null); setLastResult(null); setUnderstood(false); setConfirmText(""); }}
            data-testid={`button-profile-${p.id}`}
            className={`text-left rounded-lg border p-4 transition-all hover:shadow-sm ${profileColorClass[p.color]} ${selectedProfile?.id === p.id ? "ring-2 ring-primary" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm">{p.name}</div>
              <Badge className={`text-xs shrink-0 ${profileBadgeClass[p.color]}`}>{p.affectedTables.length} tables</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
          </button>
        ))}
      </div>

      {selectedProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ChevronRight className="h-4 w-4" />
              {selectedProfile.name}
            </CardTitle>
            <CardDescription>{selectedProfile.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide mb-2">Will be deleted</p>
                <div className="space-y-1">
                  {selectedProfile.affectedTables.map((t) => (
                    <div key={t} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-red-50 dark:bg-red-950/20">
                      <Trash2 className="h-3 w-3 text-red-500 shrink-0" />
                      <span className="font-mono">{t}</span>
                      {preview?.tableCounts[t] !== undefined && (
                        <Badge variant="outline" className="ml-auto text-xs font-mono">{fmt(preview.tableCounts[t])}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2">Protected (preserved)</p>
                <div className="space-y-1">
                  {selectedProfile.protected.map((t) => (
                    <div key={t} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-emerald-50 dark:bg-emerald-950/20">
                      <Shield className="h-3 w-3 text-emerald-500 shrink-0" />
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => previewMutation.mutate(selectedProfile.id)}
              disabled={previewMutation.isPending}
              data-testid="button-profile-preview"
            >
              <Eye className="h-4 w-4 mr-2" />
              {previewMutation.isPending ? "Counting rows…" : "Dry Run Preview"}
            </Button>

            {preview && preview.profileId === selectedProfile.id && (
              <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    {preview.totalRows.toLocaleString()} rows will be deleted
                  </span>
                  <Badge variant="outline" className="text-amber-700 border-amber-400">Dry Run</Badge>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(preview.tableCounts).map(([table, count]) => (
                    <div key={table} className="flex items-center justify-between text-xs py-0.5">
                      <span className="font-mono text-muted-foreground">{table}</span>
                      <Badge variant={count > 0 ? "destructive" : "secondary"} className="font-mono text-xs">{count.toLocaleString()}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preview && preview.profileId === selectedProfile.id && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-start gap-3">
                  <input type="checkbox" id="prof-understood" checked={understood} onChange={(e) => setUnderstood(e.target.checked)}
                    className="mt-1 h-4 w-4 cursor-pointer accent-destructive" data-testid="checkbox-profile-understood" />
                  <Label htmlFor="prof-understood" className="text-sm leading-snug cursor-pointer">
                    I understand this operation is <strong>destructive and cannot be undone</strong>.
                  </Label>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">
                    Type <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">{expectedPhrase}</code> to confirm
                  </Label>
                  <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={expectedPhrase} className="font-mono" data-testid="input-profile-confirm" autoComplete="off" />
                  {confirmText === expectedPhrase && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Phrase confirmed
                    </p>
                  )}
                </div>
                <Button variant="destructive" className="w-full" disabled={!canExecute} onClick={() => executeMutation.mutate()} data-testid="button-profile-execute">
                  <Trash2 className="h-4 w-4 mr-2" />
                  {executeMutation.isPending ? "Resetting…" : `Execute — Delete ${preview.totalRows.toLocaleString()} rows`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastResult && (
        <Card className="border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Profile Reset Complete — {lastResult.profileId}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{lastResult.rowsDeleted.toLocaleString()} rows removed in {lastResult.durationMs}ms.</p>
            {lastResult.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {lastResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-amber-600 font-mono">{e}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Full Reset tab (existing behavior) ────────────────────────────────────────

function FullResetTab() {
  const { toast } = useToast();
  const CONFIRMATION_PHRASE = "RESET DATABASE";
  const [previewCounts, setPreviewCounts] = useState<ResetCounts | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [lastResult, setLastResult] = useState<{ counts: ResetCounts; durationMs: number; errors: string[]; executedAt: string } | null>(null);

  const { data: historyData, refetch: refetchHistory } = useQuery<{ history: HistoryRow[] }>({
    queryKey: ["/api/admin/dev/reset/history"],
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/dev/reset/preview");
      return res.json() as Promise<{ counts: ResetCounts }>;
    },
    onSuccess: (data) => { setPreviewCounts(data.counts); toast({ title: "Preview ready", description: "Review impact below." }); },
    onError: (err: Error) => toast({ title: "Preview failed", description: err.message, variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/dev/reset/execute", { confirm: confirmText, understood });
      return res.json() as Promise<{ success: boolean; counts: ResetCounts; durationMs: number; errors: string[]; executedAt: string }>;
    },
    onSuccess: (data) => {
      setLastResult({ counts: data.counts, durationMs: data.durationMs, errors: data.errors, executedAt: data.executedAt });
      setPreviewCounts(null); setUnderstood(false); setConfirmText("");
      refetchHistory();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dev/env/snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dev/env/platform-stats"] });
      toast({ title: "Database reset complete", description: `Completed in ${data.durationMs}ms.` });
    },
    onError: (err: Error) => toast({ title: "Reset failed", description: err.message, variant: "destructive" }),
  });

  const totalToDelete = previewCounts ? Object.values(previewCounts).reduce((a, b) => a + b, 0) : 0;
  const canExecute = understood && confirmText === CONFIRMATION_PHRASE && !!previewCounts && !executeMutation.isPending;

  const countEntries: Array<{ label: string; key: keyof ResetCounts; danger?: boolean }> = [
    { label: "Patients", key: "patients", danger: true },
    { label: "Providers", key: "providers", danger: true },
    { label: "Appointments", key: "appointments", danger: true },
    { label: "Payments", key: "payments", danger: true },
    { label: "Wallets", key: "wallets" },
    { label: "Notifications", key: "notifications" },
    { label: "Reviews", key: "reviews" },
    { label: "Documents", key: "documents" },
    { label: "Messages", key: "messages" },
    { label: "Medical Records", key: "medicalRecords" },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Full Non-System Reset</CardTitle>
          </div>
          <CardDescription>
            Removes ALL patient, provider, and operational test data.
            Preserves admin accounts, service catalog, payment providers, RBAC, and platform configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300 flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span><strong>Destructive and irreversible.</strong> Use targeted Reset Profiles for selective cleanup. This removes all 40+ operational tables.</span>
          </div>
          <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}
            data-testid="button-preview-reset" className="w-full">
            <Eye className="h-4 w-4 mr-2" />
            {previewMutation.isPending ? "Counting rows…" : "Preview Full Reset (Dry Run)"}
          </Button>
        </CardContent>
      </Card>

      {previewCounts && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Impact Summary — {totalToDelete.toLocaleString()} rows
            </CardTitle>
            <CardDescription>No data has been modified yet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {countEntries.map(({ label, key, danger }) => (
              <div key={key} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/40">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Badge variant={previewCounts[key] === 0 ? "secondary" : danger ? "destructive" : "outline"} className="font-mono text-xs">
                  {previewCounts[key].toLocaleString()}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {previewCounts && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" /> Confirm Execution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <input type="checkbox" id="full-understood" checked={understood} onChange={(e) => setUnderstood(e.target.checked)}
                className="mt-1 h-4 w-4 cursor-pointer accent-destructive" data-testid="checkbox-understood" />
              <Label htmlFor="full-understood" className="text-sm leading-snug cursor-pointer">
                I understand this operation is <strong>destructive and cannot be undone</strong>.
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">
                Type <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">{CONFIRMATION_PHRASE}</code> to confirm
              </Label>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRMATION_PHRASE} className="font-mono" data-testid="input-confirmation-phrase" autoComplete="off" />
              {confirmText === CONFIRMATION_PHRASE && (
                <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Phrase confirmed</p>
              )}
            </div>
            <Button variant="destructive" className="w-full" disabled={!canExecute} onClick={() => executeMutation.mutate()} data-testid="button-execute-reset">
              <Trash2 className="h-4 w-4 mr-2" />
              {executeMutation.isPending ? "Resetting database…" : `Execute Full Reset — Delete ${totalToDelete.toLocaleString()} rows`}
            </Button>
          </CardContent>
        </Card>
      )}

      {lastResult && (
        <Card className="border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Reset Complete
            </CardTitle>
            <CardDescription>Completed in {lastResult.durationMs}ms at {new Date(lastResult.executedAt).toLocaleString()}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {["patients", "providers", "appointments"].map((k) => {
              const v = lastResult.counts[k as keyof ResetCounts];
              return (
                <div key={k} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/40">
                  <span className="text-sm text-muted-foreground capitalize">{k} remaining</span>
                  <Badge variant={v > 0 ? "destructive" : "secondary"} className="font-mono text-xs">{v}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Test Data Detection tab ────────────────────────────────────────────────────

function TestDataTab() {
  const { data, isFetching, refetch } = useQuery<{ report: TestDataReport }>({
    queryKey: ["/api/admin/dev/env/test-data"],
    refetchOnWindowFocus: false,
  });
  const report = data?.report;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">Test Data Detection</h3>
          <p className="text-sm text-muted-foreground">Automatically identifies seeded, demo, and dummy accounts by email pattern.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-testdata">
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Scan
        </Button>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 p-4 text-center">
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">{report.classification.safeToDelete}</div>
              <div className="text-xs text-muted-foreground mt-1">Safe to Delete</div>
            </div>
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-4 text-center">
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{report.classification.reviewRequired}</div>
              <div className="text-xs text-muted-foreground mt-1">Review Required</div>
            </div>
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-4 text-center">
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{report.classification.protected}</div>
              <div className="text-xs text-muted-foreground mt-1">Protected</div>
            </div>
          </div>

          {report.seededUsers.length === 0 ? (
            <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 p-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">No test data detected</p>
              <p className="text-xs text-muted-foreground mt-1">No accounts matched test/demo/uat/seed email patterns.</p>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Detected Test Users ({report.totalTestUsers})</CardTitle>
                <CardDescription>Matched by email pattern: test, demo, uat, seed, fake, dummy, example.com</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.seededUsers.slice(0, 30).map((u) => {
                      const isSafe = u.email.includes("uat") || u.email.includes("seed") || u.email.includes("demo");
                      return (
                        <TableRow key={u.id} data-testid={`row-testuser-${u.id}`}>
                          <TableCell className="font-mono text-xs">{u.email}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs capitalize">{u.role}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${isSafe ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"}`}>
                              {isSafe ? "Safe to delete" : "Review required"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {report.seededUsers.length > 30 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">Showing 30 of {report.totalTestUsers}</p>
                )}
              </CardContent>
            </Card>
          )}

          {report.testProviders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Detected Test Providers ({report.totalTestProviders})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider ID</TableHead>
                      <TableHead>Clinic / Name</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.testProviders.map((p) => (
                      <TableRow key={p.id} data-testid={`row-testprovider-${p.id}`}>
                        <TableCell className="font-mono text-xs">{p.id.slice(0, 8)}…</TableCell>
                        <TableCell className="text-sm">{p.clinicName ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{p.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3 flex gap-2 text-sm text-blue-700 dark:text-blue-300">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>To remove detected test data, use the <strong>Reset Profiles</strong> tab — select Patient Data Reset or Provider Data Reset.</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── DB Health tab ──────────────────────────────────────────────────────────────

function DbHealthTab() {
  const { data, isFetching, refetch } = useQuery<DbHealthData>({
    queryKey: ["/api/admin/dev/env/db-health"],
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">Database Health</h3>
          <p className="text-sm text-muted-foreground">Table sizes, row counts, cache hit rates, and unused indexes.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-dbhealth">
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Total Database Size" value={fmtBytes(data.totalDatabaseSizeBytes)} icon={Database} />
            <StatCard label="Heap Cache Hit Rate" value={`${data.cacheHitRate.heap.toFixed(1)}%`} icon={Activity}
              sub={data.cacheHitRate.heap >= 95 ? "Excellent" : data.cacheHitRate.heap >= 85 ? "Good" : "Needs attention"} />
            <StatCard label="Index Cache Hit Rate" value={`${data.cacheHitRate.index.toFixed(1)}%`} icon={BarChart3}
              sub={data.cacheHitRate.index >= 95 ? "Excellent" : data.cacheHitRate.index >= 85 ? "Good" : "Needs attention"} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4" />
                Largest Tables
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead className="text-right">Live Rows</TableHead>
                    <TableHead className="text-right">Dead Rows</TableHead>
                    <TableHead className="text-right">Total Size</TableHead>
                    <TableHead className="text-right">Index Size</TableHead>
                    <TableHead>Last Vacuum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topTables.slice(0, 20).map((t) => (
                    <TableRow key={t.table} data-testid={`row-table-${t.table}`}>
                      <TableCell className="font-mono text-xs">{t.table}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmt(t.liveRows)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        <span className={t.deadRows > 1000 ? "text-amber-600 font-medium" : ""}>{fmt(t.deadRows)}</span>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtBytes(t.totalSizeBytes)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtBytes(t.indexSizeBytes)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{timeAgo(t.lastAutovacuum)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data.unusedIndexes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Low-Usage Indexes ({data.unusedIndexes.length})
                </CardTitle>
                <CardDescription>Indexes with fewer than 5 scans since last statistics reset. Review before dropping.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table</TableHead>
                      <TableHead>Index</TableHead>
                      <TableHead className="text-right">Scans</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.unusedIndexes.map((idx) => (
                      <TableRow key={idx.index}>
                        <TableCell className="font-mono text-xs">{idx.table}</TableCell>
                        <TableCell className="font-mono text-xs">{idx.index}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{idx.scans}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ── Audit Log tab ──────────────────────────────────────────────────────────────

function AuditLogTab() {
  const { data, isFetching, refetch } = useQuery<{ history: HistoryRow[] }>({
    queryKey: ["/api/admin/dev/reset/history"],
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">Reset Audit Log</h3>
          <p className="text-sm text-muted-foreground">Every reset operation logged with admin, timestamp, profile, and row counts.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-audit">
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {data?.history.length === 0 && (
        <div className="rounded-lg border bg-muted/30 p-8 text-center">
          <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No reset operations recorded yet.</p>
        </div>
      )}

      {data && data.history.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.history.map((row) => {
                  const isExec = row.action === "db_reset_executed";
                  const profileId = row.details?.profileId;
                  return (
                    <TableRow key={row.id} data-testid={`row-audit-${row.id}`}>
                      <TableCell>
                        <Badge variant={isExec ? "destructive" : "secondary"} className="text-xs">
                          {isExec ? (profileId ? `reset: ${profileId}` : "full reset") : "preview"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.first_name} {row.last_name}
                        <div className="text-xs text-muted-foreground font-mono">{row.email}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.details?.rowsDeleted !== undefined && `${row.details.rowsDeleted} rows`}
                        {row.details?.counts && `${Object.values(row.details.counts).reduce((a, b) => a + b, 0)} rows affected`}
                        {row.details?.durationMs && ` · ${row.details.durationMs}ms`}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main Console ───────────────────────────────────────────────────────────────

export function EnvironmentManagementConsole() {
  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Server className="h-5 w-5" />
          Environment Management
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Reset, clean, audit, and monitor the platform environment. All operations preserve protected configuration and admin accounts.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap h-auto gap-1 mb-4 w-full justify-start">
          <TabsTrigger value="overview" data-testid="tab-overview" className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="profiles" data-testid="tab-profiles" className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" /> Reset Profiles
          </TabsTrigger>
          <TabsTrigger value="full-reset" data-testid="tab-full-reset" className="flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Full Reset
          </TabsTrigger>
          <TabsTrigger value="demo-data" data-testid="tab-demo-data" className="flex items-center gap-1.5">
            <Sprout className="h-3.5 w-3.5" /> Demo Data
          </TabsTrigger>
          <TabsTrigger value="test-data" data-testid="tab-test-data" className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" /> Test Data
          </TabsTrigger>
          <TabsTrigger value="db-health" data-testid="tab-db-health" className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" /> DB Health
          </TabsTrigger>
          <TabsTrigger value="audit-log" data-testid="tab-audit-log" className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="profiles"><ResetProfilesTab /></TabsContent>
        <TabsContent value="full-reset"><FullResetTab /></TabsContent>
        <TabsContent value="demo-data"><SeedUatTool /></TabsContent>
        <TabsContent value="test-data"><TestDataTab /></TabsContent>
        <TabsContent value="db-health"><DbHealthTab /></TabsContent>
        <TabsContent value="audit-log"><AuditLogTab /></TabsContent>
      </Tabs>
    </div>
  );
}
