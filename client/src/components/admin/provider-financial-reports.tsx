import { useState, useMemo, useCallback } from "react";
import { formatCurrencyForCountry, useAdminCurrency } from "@/lib/currency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  DollarSign, TrendingUp, Clock, CheckCircle, Download, Search,
  ChevronLeft, BarChart3, FileText, ArrowUpRight, ArrowDownRight,
  Banknote, Wallet, Receipt, Globe, MapPin, RefreshCw,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProviderOverviewRow {
  provider_id: string;
  provider_name: string;
  provider_email: string;
  provider_type: string;
  country_code: string | null;
  total_appointments: string;
  completed_appointments: string;
  cancelled_appointments: string;
  gross_revenue: string;
  total_platform_fees: string;
  total_promo_discount: string;
  net_earnings: string;
  pending_payout: string;
  paid_payout: string;
  last_appointment_date: string | null;
}

interface EarningRecord {
  id: string;
  status: "pending" | "paid";
  provider_earning: string;
  platform_fee: string;
  total_amount: string;
  created_at: string;
  paid_at: string | null;
  payout_reference: string | null;
  appointment_number: string | null;
  appointment_date: string;
  visit_type: string;
  service_name: string | null;
  promo_discount: string;
  tax_amount: string;
}

interface ProviderReport {
  provider: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    provider_type: string;
    country_code: string | null;
    is_verified: boolean;
  };
  summary: {
    completed_count: string;
    cancelled_count: string;
    active_count: string;
    gross_revenue: string;
    platform_fees: string;
    promo_discounts: string;
    tax_collected: string;
    refunds_issued: string;
    net_earnings: string;
    pending_payout: string;
    paid_payout: string;
    pending_records: string;
    paid_records: string;
  };
  monthly: Array<{
    month: string;
    completed: string;
    cancelled: string;
    gross_revenue: string;
    platform_fees: string;
    net_earnings: string;
  }>;
  byVisitType: Array<{
    visit_type: string;
    completed: string;
    revenue: string;
  }>;
  earnings: EarningRecord[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function n(v: string | number | null | undefined): number {
  return Number(v ?? 0);
}

function fmtCurr(v: string | number | null | undefined, cc?: string | null): string {
  return formatCurrencyForCountry(v, cc);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtMonthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function visitTypeLabel(vt: string) {
  const map: Record<string, string> = { online: "Online", home_visit: "Home Visit", clinic_visit: "Clinic" };
  return map[vt] ?? vt;
}

function StatCard({ icon: Icon, label, value, sub, color = "text-foreground" }: {
  icon: any; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold tabular-nums truncate ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Mark paid dialog ───────────────────────────────────────────────────────────

function MarkPaidDialog({
  open,
  selectedIds,
  providerId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  selectedIds: string[];
  providerId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", `/api/admin/financial/providers/${providerId}/mark-paid`, {
        earningIds: selectedIds,
        payoutReference: ref.trim() || undefined,
      });
      toast({ title: `${selectedIds.length} earning${selectedIds.length !== 1 ? "s" : ""} marked as paid` });
      onSuccess();
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to mark as paid", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-mark-paid">
        <DialogHeader>
          <DialogTitle>Mark as Paid</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">
            Marking <strong>{selectedIds.length}</strong> earning record{selectedIds.length !== 1 ? "s" : ""} as paid.
          </p>
          <div className="space-y-1">
            <Label>Payout Reference (optional)</Label>
            <Input
              value={ref}
              onChange={e => setRef(e.target.value)}
              placeholder="Bank transfer ID, Wise ref, etc."
              data-testid="input-payout-ref"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} data-testid="button-confirm-mark-paid">
              {loading ? "Processing…" : "Mark as Paid"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Per-provider detail view ───────────────────────────────────────────────────

function ProviderDetail({ providerId, onBack }: { providerId: string; onBack: () => void }) {
  const { format: _adminFmt } = useAdminCurrency();
  // Admin panels ALWAYS display in USD — shadow module-level fmtCurr so all
  // existing call sites (fmtCurr(v, cc)) automatically use USD formatting.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function fmtCurr(v: string | number | null | undefined, _cc?: string | null) {
    return _adminFmt(Number(v) || 0);
  }
  const { toast } = useToast();
  const qc = useQueryClient();
  const [innerTab, setInnerTab] = useState("overview");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "paid">("all");

  const { data, isLoading, refetch } = useQuery<ProviderReport>({
    queryKey: ["/api/admin/financial/providers", providerId],
    queryFn: () => fetch(`/api/admin/financial/providers/${providerId}/detail`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
    }).then(r => r.json()),
  });

  const cc = data?.provider.country_code ?? null;
  const s  = data?.summary;

  const visibleEarnings = useMemo(() => {
    if (!data?.earnings) return [];
    if (filterStatus === "all") return data.earnings;
    return data.earnings.filter(e => e.status === filterStatus);
  }, [data, filterStatus]);

  const pendingEarnings = data?.earnings?.filter(e => e.status === "pending") ?? [];
  const pendingTotal    = pendingEarnings.reduce((acc, e) => acc + n(e.provider_earning), 0);

  function toggleAll() {
    if (selectedIds.size === pendingEarnings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingEarnings.map(e => e.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleExport() {
    window.open(`/api/admin/financial/providers/${providerId}/export-csv`, "_blank");
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  if (!data) return <p className="text-muted-foreground">Failed to load report.</p>;

  const { provider } = data;
  const providerName = `${provider.first_name} ${provider.last_name}`.trim() || provider.email;

  const chartData = (data.monthly ?? []).map(m => ({
    month: fmtMonthLabel(m.month),
    "Gross Revenue": n(m.gross_revenue),
    "Platform Fee":  n(m.platform_fees),
    "Net Earning":   n(m.net_earnings),
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-overview">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-10 w-10">
            <AvatarImage src={provider.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {(provider.first_name?.[0] ?? "") + (provider.last_name?.[0] ?? "")}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-lg font-bold leading-tight flex items-center gap-2">
              {providerName}
              {provider.is_verified && (
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              )}
            </h2>
            <p className="text-xs text-muted-foreground">{provider.email} · {provider.provider_type?.replace(/_/g, " ")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-report">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Pending payout alert */}
      {n(s?.pending_payout) > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-sm">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              <strong>{fmtCurr(s?.pending_payout, cc)}</strong> pending payout across{" "}
              <strong>{s?.pending_records}</strong> record{s?.pending_records !== "1" ? "s" : ""}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:border-amber-700 shrink-0"
            onClick={() => { setFilterStatus("pending"); setInnerTab("earnings"); setSelectedIds(new Set(pendingEarnings.map(e => e.id))); }}
            data-testid="button-view-pending"
          >
            <Banknote className="h-4 w-4 mr-1.5" /> Pay All
          </Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard icon={TrendingUp}   label="Gross Revenue"     value={fmtCurr(s?.gross_revenue, cc)}   sub={`${s?.completed_count ?? 0} sessions`} />
        <StatCard icon={Receipt}      label="Platform Fees"     value={fmtCurr(s?.platform_fees, cc)}   color="text-blue-600" />
        <StatCard icon={DollarSign}   label="Net Earnings"      value={fmtCurr(s?.net_earnings, cc)}    color="text-green-600" />
        <StatCard icon={Clock}        label="Pending Payout"    value={fmtCurr(s?.pending_payout, cc)}  color="text-amber-600" sub={`${s?.pending_records ?? 0} records`} />
        <StatCard icon={Wallet}       label="Total Paid Out"    value={fmtCurr(s?.paid_payout, cc)}     color="text-emerald-600" sub={`${s?.paid_records ?? 0} records`} />
        <StatCard icon={FileText}     label="Refunds Issued"    value={fmtCurr(s?.refunds_issued, cc)}  color="text-red-500" sub={`${s?.cancelled_count ?? 0} cancelled`} />
      </div>

      <Tabs value={innerTab} onValueChange={setInnerTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-report-overview">
            <BarChart3 className="h-4 w-4 mr-1.5" /> Monthly Trend
          </TabsTrigger>
          <TabsTrigger value="earnings" data-testid="tab-report-earnings">
            <Banknote className="h-4 w-4 mr-1.5" /> Earnings Records
          </TabsTrigger>
          <TabsTrigger value="breakdown" data-testid="tab-report-breakdown">
            <Receipt className="h-4 w-4 mr-1.5" /> Visit Type Breakdown
          </TabsTrigger>
        </TabsList>

        {/* Monthly trend */}
        <TabsContent value="overview" className="pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Monthly Revenue (last 13 months)</CardTitle>
              <CardDescription>Gross revenue, platform fee, and net earning per calendar month.</CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  No appointment data available yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                    <Tooltip
                      formatter={(value: number, name: string) => [fmtCurr(value, cc), name]}
                      contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Gross Revenue" fill="hsl(var(--primary) / 0.4)"  radius={[3,3,0,0]} />
                    <Bar dataKey="Platform Fee"  fill="hsl(var(--primary) / 0.7)"  radius={[3,3,0,0]} />
                    <Bar dataKey="Net Earning"   fill="hsl(var(--primary))"        radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Earnings records */}
        <TabsContent value="earnings" className="pt-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Select value={filterStatus} onValueChange={v => { setFilterStatus(v as any); setSelectedIds(new Set()); }}>
                <SelectTrigger className="w-36" data-testid="select-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All records</SelectItem>
                  <SelectItem value="pending">Pending only</SelectItem>
                  <SelectItem value="paid">Paid only</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{visibleEarnings.length} records</span>
            </div>
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                onClick={() => setShowMarkPaid(true)}
                data-testid="button-mark-paid"
              >
                <CheckCircle className="h-4 w-4 mr-1.5" />
                Mark {selectedIds.size} as Paid
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        {filterStatus !== "paid" && (
                          <Checkbox
                            checked={selectedIds.size > 0 && selectedIds.size === pendingEarnings.filter(e => visibleEarnings.includes(e)).length}
                            onCheckedChange={toggleAll}
                            aria-label="Select all pending"
                            data-testid="checkbox-select-all"
                          />
                        )}
                      </TableHead>
                      <TableHead>Appointment</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Visit</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Fee</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleEarnings.length === 0 && (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">No records found.</TableCell></TableRow>
                    )}
                    {visibleEarnings.map(e => (
                      <TableRow key={e.id} data-testid={`row-earning-${e.id}`} className={e.status === "paid" ? "opacity-70" : ""}>
                        <TableCell>
                          {e.status === "pending" && (
                            <Checkbox
                              checked={selectedIds.has(e.id)}
                              onCheckedChange={() => toggleOne(e.id)}
                              data-testid={`checkbox-earning-${e.id}`}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {e.appointment_number ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">{fmtDate(e.appointment_date)}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{e.service_name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{visitTypeLabel(e.visit_type)}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">{fmtCurr(e.total_amount, cc)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground tabular-nums">{fmtCurr(e.platform_fee, cc)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums text-green-700 dark:text-green-400">{fmtCurr(e.provider_earning, cc)}</TableCell>
                        <TableCell>
                          {e.status === "paid"
                            ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="h-3.5 w-3.5" />Paid</span>
                            : <span className="flex items-center gap-1 text-xs text-amber-600"><Clock className="h-3.5 w-3.5" />Pending</span>
                          }
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {e.paid_at ? (
                            <div>
                              <p>{fmtDate(e.paid_at)}</p>
                              {e.payout_reference && <p className="font-mono text-[10px] truncate max-w-[80px]">{e.payout_reference}</p>}
                            </div>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Footer totals */}
              {visibleEarnings.length > 0 && (
                <div className="flex items-center justify-end gap-6 px-4 py-3 border-t text-sm font-medium">
                  <span>Gross: <strong className="tabular-nums">{fmtCurr(visibleEarnings.reduce((a, e) => a + n(e.total_amount), 0), cc)}</strong></span>
                  <span>Platform: <strong className="tabular-nums text-blue-600">{fmtCurr(visibleEarnings.reduce((a, e) => a + n(e.platform_fee), 0), cc)}</strong></span>
                  <span>Net: <strong className="tabular-nums text-green-700 dark:text-green-400">{fmtCurr(visibleEarnings.reduce((a, e) => a + n(e.provider_earning), 0), cc)}</strong></span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Visit type breakdown */}
        <TabsContent value="breakdown" className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(data.byVisitType ?? []).map(vt => (
              <Card key={vt.visit_type}>
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm font-medium text-muted-foreground mb-1">{visitTypeLabel(vt.visit_type)}</p>
                  <p className="text-2xl font-bold tabular-nums">{fmtCurr(vt.revenue, cc)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{vt.completed} completed appointment{vt.completed !== "1" ? "s" : ""}</p>
                </CardContent>
              </Card>
            ))}
            {(data.byVisitType ?? []).length === 0 && (
              <p className="text-muted-foreground text-sm col-span-3 py-8 text-center">No visit type data yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <MarkPaidDialog
        open={showMarkPaid}
        selectedIds={Array.from(selectedIds)}
        providerId={providerId}
        onClose={() => setShowMarkPaid(false)}
        onSuccess={() => {
          setShowMarkPaid(false);
          setSelectedIds(new Set());
          qc.invalidateQueries({ queryKey: ["/api/admin/financial/providers", providerId] });
        }}
      />
    </div>
  );
}

// ── Overview table ─────────────────────────────────────────────────────────────

function OverviewTable({ onSelect }: { onSelect: (id: string) => void }) {
  const { format: fmtMoney } = useAdminCurrency();
  const [search, setSearch] = useState("");
  const [filterCountry, setFilterCountry] = useState("all");
  const [sortBy, setSortBy] = useState<"gross_revenue" | "pending_payout" | "net_earnings">("gross_revenue");

  const { data: rows = [], isLoading, refetch } = useQuery<ProviderOverviewRow[]>({
    queryKey: ["/api/admin/financial/providers-overview", filterCountry],
    queryFn: () => {
      const q = filterCountry !== "all" ? `?countryCode=${filterCountry}` : "";
      return fetch(`/api/admin/financial/providers-overview${q}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      }).then(r => r.json()).then(d => Array.isArray(d) ? d : (d?.providers ?? []));
    },
  });

  const filtered = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => `${r.provider_name} ${r.provider_email}`.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => n(b[sortBy]) - n(a[sortBy]));
  }, [rows, search, sortBy]);

  const totals = useMemo(() => ({
    gross:   rows.reduce((s, r) => s + n(r.gross_revenue), 0),
    fees:    rows.reduce((s, r) => s + n(r.total_platform_fees), 0),
    net:     rows.reduce((s, r) => s + n(r.net_earnings), 0),
    pending: rows.reduce((s, r) => s + n(r.pending_payout), 0),
    paid:    rows.reduce((s, r) => s + n(r.paid_payout), 0),
  }), [rows]);

  return (
    <div className="space-y-5">
      {/* Platform totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={TrendingUp}  label="Platform Gross Revenue" value={fmtMoney(totals.gross)}   />
        <StatCard icon={Receipt}     label="Total Platform Fees"     value={fmtMoney(totals.fees)}   color="text-blue-600" />
        <StatCard icon={DollarSign}  label="Total Net Earnings"      value={fmtMoney(totals.net)}    color="text-green-600" />
        <StatCard icon={Clock}       label="Pending Payouts"         value={fmtMoney(totals.pending)} color="text-amber-600" />
        <StatCard icon={Wallet}      label="Total Paid Out"          value={fmtMoney(totals.paid)}   color="text-emerald-600" />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search providers…"
              className="pl-9 w-52"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-providers"
            />
          </div>
          <Select value={filterCountry} onValueChange={setFilterCountry}>
            <SelectTrigger className="w-32" data-testid="select-filter-country">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              <SelectItem value="HU">Hungary</SelectItem>
              <SelectItem value="IR">Iran</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
            <SelectTrigger className="w-40" data-testid="select-sort-by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gross_revenue">Sort: Gross Revenue</SelectItem>
              <SelectItem value="net_earnings">Sort: Net Earnings</SelectItem>
              <SelectItem value="pending_payout">Sort: Pending Payout</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-overview">
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Appointments</TableHead>
                  <TableHead className="text-right">Gross Revenue</TableHead>
                  <TableHead className="text-right">Platform Fee</TableHead>
                  <TableHead className="text-right">Net Earnings</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Paid Out</TableHead>
                  <TableHead>Last Session</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">No providers found.</TableCell></TableRow>
                )}
                {filtered.map(r => (
                  <TableRow key={r.provider_id} data-testid={`row-fin-${r.provider_id}`} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelect(r.provider_id)}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{r.provider_name}</p>
                        <p className="text-xs text-muted-foreground">{r.provider_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{r.provider_type?.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-sm tabular-nums">
                        <span className="text-green-600">{r.completed_appointments}</span>
                        <span className="text-muted-foreground"> / {r.total_appointments}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {fmtMoney(r.gross_revenue)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-blue-600 tabular-nums">
                      {fmtMoney(r.total_platform_fees)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-green-700 dark:text-green-400 tabular-nums">
                      {fmtMoney(r.net_earnings)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-amber-600 tabular-nums">
                      {n(r.pending_payout) > 0
                        ? <span className="flex items-center justify-end gap-1">{fmtMoney(r.pending_payout)} <Clock className="h-3 w-3" /></span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                    <TableCell className="text-right text-sm text-emerald-600 tabular-nums">
                      {n(r.paid_payout) > 0 ? fmtMoney(r.paid_payout) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(r.last_appointment_date)}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); onSelect(r.provider_id); }} data-testid={`button-view-report-${r.provider_id}`}>
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!isLoading && rows.length > 0 && (
            <div className="flex items-center justify-end gap-6 px-4 py-3 border-t text-sm font-medium">
              <span>Gross: <strong className="tabular-nums">{fmtMoney(totals.gross)}</strong></span>
              <span>Fees: <strong className="tabular-nums text-blue-600">{fmtMoney(totals.fees)}</strong></span>
              <span>Net: <strong className="tabular-nums text-green-700">{fmtMoney(totals.net)}</strong></span>
              <span>Pending: <strong className="tabular-nums text-amber-600">{fmtMoney(totals.pending)}</strong></span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function ProviderFinancialReports() {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  return (
    <div>
      {selectedProviderId
        ? <ProviderDetail providerId={selectedProviderId} onBack={() => setSelectedProviderId(null)} />
        : <OverviewTable onSelect={setSelectedProviderId} />
      }
    </div>
  );
}
