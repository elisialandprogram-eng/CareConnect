import { formatDate } from "@/lib/datetime";
import { useState, useMemo, useCallback } from "react";
import { formatCurrencyForCountry, useAdminCurrency } from "@/lib/currency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { reportProviderTypeLabel } from "@/lib/report-localization";
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
  provider_net_earnings_usd: string;
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
    net_earnings: string;
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
  return formatDate(iso, { year: "numeric", month: "short", day: "numeric" });
}

function fmtMonthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return formatDate(new Date(Number(y), Number(m) - 1, 1), { month: "short", year: "2-digit" });
}

function visitTypeLabel(vt: string, t: (key: string) => string) {
  const map: Record<string, string> = {
    online: t("admin.provider_financials.online"),
    home_visit: t("admin.provider_financials.home_visit"),
    clinic_visit: t("admin.provider_financials.clinic"),
  };
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
  const { t: translate } = useTranslation();
  const t = (key: string, options?: any): string =>
    String(translate(/^admin\.(review_moderation|category_requests|calendar\.|payouts|provider_wallets|provider_financials)/.test(key)
      ? key.replace(/^admin\./, "admin_dashboard.")
      : key, options));
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
      toast({
        title: t(
          selectedIds.length === 1
            ? "admin.provider_financials.marked_paid"
            : "admin.provider_financials.marked_paid_plural",
          { count: selectedIds.length },
        ),
      });
      onSuccess();
    } catch (err: any) {
      toast({ title: err?.message ?? t("admin.provider_financials.mark_paid_failed"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-mark-paid">
        <DialogHeader>
          <DialogTitle>{t("admin.provider_financials.mark_paid_title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">
             {t(
               selectedIds.length === 1
                 ? "admin.provider_financials.mark_paid_description"
                 : "admin.provider_financials.mark_paid_description_plural",
               { count: selectedIds.length },
             )}
          </p>
          <div className="space-y-1">
             <Label>{t("admin.provider_financials.payout_reference")}</Label>
            <Input
              value={ref}
              onChange={e => setRef(e.target.value)}
               placeholder={t("admin.provider_financials.payout_reference_placeholder")}
              data-testid="input-payout-ref"
            />
          </div>
          <DialogFooter>
           <Button type="button" variant="outline" onClick={onClose}>{t("admin.provider_financials.cancel")}</Button>
            <Button type="submit" disabled={loading} data-testid="button-confirm-mark-paid">
               {loading ? t("admin.provider_financials.processing") : t("admin.provider_financials.mark_paid_title")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Per-provider detail view ───────────────────────────────────────────────────

function ProviderDetail({ providerId, onBack }: { providerId: string; onBack: () => void }) {
  const { t: translate } = useTranslation();
  const t = (key: string, options?: any): string =>
    String(translate(/^admin\.(review_moderation|category_requests|calendar\.|payouts|provider_wallets|provider_financials)/.test(key)
      ? key.replace(/^admin\./, "admin_dashboard.")
      : key, options));
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
  const pendingTotal    = pendingEarnings.reduce((acc, e) => acc + n(e.provider_net_earnings_usd), 0);

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

  if (!data) return <p className="text-muted-foreground">{t("admin.provider_financials.load_failed")}</p>;

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
            <p className="text-xs text-muted-foreground">{provider.email} · {provider.provider_type ? reportProviderTypeLabel(t, provider.provider_type) : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-report">
             <RefreshCw className="h-4 w-4 mr-1.5" /> {t("admin.provider_financials.refresh")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-csv">
             <Download className="h-4 w-4 mr-1.5" /> {t("admin.provider_financials.export_csv")}
          </Button>
        </div>
      </div>

      {/* Pending payout alert */}
      {n(s?.pending_payout) > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-sm">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
               {t(
                 s?.pending_records === "1"
                   ? "admin.provider_financials.pending_payout_alert"
                   : "admin.provider_financials.pending_payout_alert_plural",
                 { amount: fmtCurr(s?.pending_payout, cc), count: s?.pending_records },
               )}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:border-amber-700 shrink-0"
            onClick={() => { setFilterStatus("pending"); setInnerTab("earnings"); setSelectedIds(new Set(pendingEarnings.map(e => e.id))); }}
            data-testid="button-view-pending"
          >
             <Banknote className="h-4 w-4 mr-1.5" /> {t("admin.provider_financials.pay_all")}
          </Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
         <StatCard icon={TrendingUp}   label={t("admin.provider_financials.gross_revenue")} value={fmtCurr(s?.gross_revenue, cc)}   sub={t("admin.provider_financials.sessions", { count: s?.completed_count ?? 0 })} />
         <StatCard icon={Receipt}      label={t("admin.provider_financials.platform_fees")} value={fmtCurr(s?.platform_fees, cc)}   color="text-blue-600" />
         <StatCard icon={DollarSign}   label={t("admin.provider_financials.net_earnings")} value={fmtCurr(s?.net_earnings, cc)}    color="text-green-600" />
         <StatCard icon={Clock}        label={t("admin.provider_financials.pending_payout")} value={fmtCurr(s?.pending_payout, cc)}  color="text-amber-600" sub={t("admin.provider_financials.records", { count: s?.pending_records ?? 0 })} />
         <StatCard icon={Wallet}       label={t("admin.provider_financials.total_paid_out")} value={fmtCurr(s?.paid_payout, cc)}     color="text-emerald-600" sub={t("admin.provider_financials.records", { count: s?.paid_records ?? 0 })} />
         <StatCard icon={FileText}     label={t("admin.provider_financials.refunds_issued")} value={fmtCurr(s?.refunds_issued, cc)}  color="text-red-500" sub={t("admin.provider_financials.cancelled", { count: s?.cancelled_count ?? 0 })} />
      </div>

      <Tabs value={innerTab} onValueChange={setInnerTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-report-overview">
             <BarChart3 className="h-4 w-4 mr-1.5" /> {t("admin.provider_financials.monthly_trend")}
          </TabsTrigger>
          <TabsTrigger value="earnings" data-testid="tab-report-earnings">
             <Banknote className="h-4 w-4 mr-1.5" /> {t("admin.provider_financials.earnings_records")}
          </TabsTrigger>
          <TabsTrigger value="breakdown" data-testid="tab-report-breakdown">
             <Receipt className="h-4 w-4 mr-1.5" /> {t("admin.provider_financials.visit_type_breakdown")}
          </TabsTrigger>
        </TabsList>

        {/* Monthly trend */}
        <TabsContent value="overview" className="pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("admin.provider_financials.monthly_revenue")}</CardTitle>
              <CardDescription>{t("admin.provider_financials.monthly_revenue_description")}</CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                   {t("admin.provider_financials.no_appointment_data")}
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
                   <SelectItem value="all">{t("admin.provider_financials.all_records")}</SelectItem>
                   <SelectItem value="pending">{t("admin.provider_financials.pending_only")}</SelectItem>
                   <SelectItem value="paid">{t("admin.provider_financials.paid_only")}</SelectItem>
                </SelectContent>
              </Select>
               <span className="text-xs text-muted-foreground">{t("admin.provider_financials.records", { count: visibleEarnings.length })}</span>
            </div>
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                onClick={() => setShowMarkPaid(true)}
                data-testid="button-mark-paid"
              >
                <CheckCircle className="h-4 w-4 mr-1.5" />
                 {t("admin.provider_financials.mark_selected_paid", { count: selectedIds.size })}
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
                             aria-label={t("admin.provider_financials.select_all_pending")}
                            data-testid="checkbox-select-all"
                          />
                        )}
                      </TableHead>
                       <TableHead>{t("admin.provider_financials.appointment")}</TableHead>
                       <TableHead>{t("admin.provider_financials.date")}</TableHead>
                       <TableHead>{t("admin.provider_financials.service")}</TableHead>
                       <TableHead>{t("admin.provider_financials.visit")}</TableHead>
                       <TableHead className="text-right">{t("admin.provider_financials.gross")}</TableHead>
                       <TableHead className="text-right">{t("admin.provider_financials.fee")}</TableHead>
                       <TableHead className="text-right">{t("admin.provider_financials.net")}</TableHead>
                       <TableHead>{t("admin.provider_financials.status")}</TableHead>
                       <TableHead>{t("admin.provider_financials.paid")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleEarnings.length === 0 && (
                       <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">{t("admin.provider_financials.no_records")}</TableCell></TableRow>
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
                           <Badge variant="outline" className="text-[10px]">{visitTypeLabel(e.visit_type, t)}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">{fmtCurr(e.total_amount, cc)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground tabular-nums">{fmtCurr(e.platform_fee, cc)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums text-green-700 dark:text-green-400">{fmtCurr(e.provider_net_earnings_usd, cc)}</TableCell>
                        <TableCell>
                          {e.status === "paid"
                             ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="h-3.5 w-3.5" />{t("admin.provider_financials.paid")}</span>
                             : <span className="flex items-center gap-1 text-xs text-amber-600"><Clock className="h-3.5 w-3.5" />{t("admin.provider_financials.pending")}</span>
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
                   <span>{t("admin.provider_financials.gross")}: <strong className="tabular-nums">{fmtCurr(visibleEarnings.reduce((a, e) => a + n(e.total_amount), 0), cc)}</strong></span>
                   <span>{t("admin.provider_financials.platform")}: <strong className="tabular-nums text-blue-600">{fmtCurr(visibleEarnings.reduce((a, e) => a + n(e.platform_fee), 0), cc)}</strong></span>
                   <span>{t("admin.provider_financials.net")}: <strong className="tabular-nums text-green-700 dark:text-green-400">{fmtCurr(visibleEarnings.reduce((a, e) => a + n(e.provider_net_earnings_usd), 0), cc)}</strong></span>
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
                   <p className="text-sm font-medium text-muted-foreground mb-1">{visitTypeLabel(vt.visit_type, t)}</p>
                  <p className="text-2xl font-bold tabular-nums">{fmtCurr(vt.net_earnings, cc)}</p>
                   <p className="text-xs text-muted-foreground">{t("admin.provider_financials.net_earnings")}</p>
                   <p className="text-xs text-muted-foreground mt-1">{t(vt.completed === "1" ? "admin.provider_financials.completed_appointments" : "admin.provider_financials.completed_appointments_plural", { count: vt.completed })}</p>
                </CardContent>
              </Card>
            ))}
            {(data.byVisitType ?? []).length === 0 && (
               <p className="text-muted-foreground text-sm col-span-3 py-8 text-center">{t("admin.provider_financials.no_visit_data")}</p>
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
  const { t: translate } = useTranslation();
  const t = (key: string, options?: any): string =>
    String(translate(/^admin\.(review_moderation|category_requests|calendar\.|payouts|provider_wallets|provider_financials)/.test(key)
      ? key.replace(/^admin\./, "admin_dashboard.")
      : key, options));
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
         <StatCard icon={TrendingUp}  label={t("admin.provider_financials.platform_gross_revenue")} value={fmtMoney(totals.gross)}   />
         <StatCard icon={Receipt}     label={t("admin.provider_financials.total_platform_fees")}     value={fmtMoney(totals.fees)}   color="text-blue-600" />
         <StatCard icon={DollarSign}  label={t("admin.provider_financials.total_net_earnings")}      value={fmtMoney(totals.net)}    color="text-green-600" />
         <StatCard icon={Clock}       label={t("admin.provider_financials.pending_payouts")}         value={fmtMoney(totals.pending)} color="text-amber-600" />
         <StatCard icon={Wallet}      label={t("admin.provider_financials.total_paid_out")}          value={fmtMoney(totals.paid)}   color="text-emerald-600" />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
               placeholder={t("admin.provider_financials.search_providers")}
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
               <SelectItem value="all">{t("admin.provider_financials.all_countries")}</SelectItem>
               <SelectItem value="HU">{t("admin.provider_financials.hungary")}</SelectItem>
               <SelectItem value="IR">{t("admin.provider_financials.iran")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
            <SelectTrigger className="w-40" data-testid="select-sort-by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
               <SelectItem value="gross_revenue">{t("admin.provider_financials.sort_gross")}</SelectItem>
               <SelectItem value="net_earnings">{t("admin.provider_financials.sort_net")}</SelectItem>
               <SelectItem value="pending_payout">{t("admin.provider_financials.sort_pending")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-overview">
           <RefreshCw className="h-4 w-4 mr-1.5" /> {t("admin.provider_financials.refresh")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                   <TableHead>{t("admin.provider_financials.providers")}</TableHead>
                   <TableHead>{t("admin.provider_financials.type")}</TableHead>
                   <TableHead className="text-right">{t("admin.provider_financials.appointments")}</TableHead>
                   <TableHead className="text-right">{t("admin.provider_financials.gross_revenue")}</TableHead>
                   <TableHead className="text-right">{t("admin.provider_financials.platform_fee")}</TableHead>
                   <TableHead className="text-right">{t("admin.provider_financials.net_earnings")}</TableHead>
                   <TableHead className="text-right">{t("admin.provider_financials.pending")}</TableHead>
                   <TableHead className="text-right">{t("admin.provider_financials.paid_out")}</TableHead>
                   <TableHead>{t("admin.provider_financials.last_session")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                   <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">{t("admin.provider_financials.loading")}</TableCell></TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                   <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">{t("admin.provider_financials.no_providers")}</TableCell></TableRow>
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
                      <Badge variant="outline" className="text-xs">{r.provider_type ? reportProviderTypeLabel(t, r.provider_type) : "—"}</Badge>
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
               <span>{t("admin.provider_financials.gross_total")} <strong className="tabular-nums">{fmtMoney(totals.gross)}</strong></span>
               <span>{t("admin.provider_financials.fees_total")} <strong className="tabular-nums text-blue-600">{fmtMoney(totals.fees)}</strong></span>
               <span>{t("admin.provider_financials.net_total")} <strong className="tabular-nums text-green-700">{fmtMoney(totals.net)}</strong></span>
               <span>{t("admin.provider_financials.pending_total")} <strong className="tabular-nums text-amber-600">{fmtMoney(totals.pending)}</strong></span>
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
