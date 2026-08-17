import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { QK } from "@/lib/query-keys";
import { useCurrency, formatInCurrency } from "@/lib/currency";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Wallet, Clock, CheckCircle2, TrendingUp, Filter, X, Download,
  ChevronDown, ChevronUp, AlertTriangle, ReceiptText, Info,
} from "lucide-react";
import { formatDate as fmtDate } from "@/lib/datetime";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

interface RichEarning {
  id: string;
  providerId: string;
  appointmentId: string;
  status: string;
  paidAt: string | null;
  paidByUserId: string | null;
  payoutReference: string | null;
  displayCurrency: string | null;
  exchangeRateUsed: string | null;
  createdAt: string;
  // appointment context
  appointmentDate: string | null;
  startTime: string | null;
  visitType: string | null;
  appointmentNumber: string | null;
  appointmentStatus: string | null;
  paymentStatus: string | null;
  refundStatus: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  countryCode: string | null;
  paymentMethod: string | null;
  providerGrossEarningsUsd: string | null;
  providerGrossEarningsLocal: string | null;
  providerGrossEarningsSnapshot: string | null;
  providerCommissionLocal: string | null;
  providerNetEarningsSnapshot: string | null;
  grossProviderPayoutUsd: string | null;
  settlementAmountUsd: string | null;
  providerNetEarningsUsd: string | null;
  providerNetEarningsLocal: string | null;
  serviceTaxAmountUsd: string | null;
  cashPlatformFeeDeductionUsd: string | null;
  cashPlatformFeeAppliedUsd: string | null;
  serviceName: string | null;
  patientFirstName: string | null;
  patientLastName: string | null;
}

interface EarningsPayload {
  earnings: RichEarning[];
  summary: {
    totalEarnings: string;
    pendingAmount: string;
    paidAmount: string;
    grossProviderPayout?: string;
    count: number;
  };
}

const CURRENCY_OPTIONS = [
  { value: "all", label: "All currencies" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "HUF", label: "HUF — Hungarian Forint" },
  { value: "IRR", label: "IRR — Iranian Rial" },
  { value: "EUR", label: "EUR — Euro" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All payment statuses" },
  { value: "completed", label: "Payment completed" },
  { value: "pending", label: "Payment pending" },
];

const VISIT_TYPE_LABELS: Record<string, string> = {
  clinic_visit: "Clinic",
  home_visit: "Home",
  online: "Online",
  telemedicine: "Video",
};

function formatDate(value: Date | string | null | undefined) {
  return fmtDate(value) || "—";
}

function patientName(e: RichEarning) {
  const name = [e.patientFirstName, e.patientLastName].filter(Boolean).join(" ");
  return name || "—";
}

function visitBadge(type: string | null) {
  if (!type) return null;
  const label = VISIT_TYPE_LABELS[type] ?? type;
  const colors: Record<string, string> = {
    clinic_visit: "bg-blue-100 text-blue-700 border-blue-200",
    home_visit: "bg-purple-100 text-purple-700 border-purple-200",
    online: "bg-cyan-100 text-cyan-700 border-cyan-200",
    telemedicine: "bg-cyan-100 text-cyan-700 border-cyan-200",
  };
  return (
    <Badge className={`text-xs border ${colors[type] ?? "bg-muted text-muted-foreground border-border"}`}>
      {label}
    </Badge>
  );
}

type EarningDisplay = {
  providerGross: number;
  providerCommission: number;
  providerNet: number;
  offlineFee: number;
  settlement: number;
  fmtPay: (n: number) => string;
};

/** Resolve only provider-owned settlement values in one display currency. */
function resolveEarningDisplay(
  e: RichEarning,
  fmtUsd: (n: number) => string,
): EarningDisplay {
  const displayCurrency = e.displayCurrency ?? "USD";
  const localGross = Number(e.providerGrossEarningsLocal ?? e.providerGrossEarningsSnapshot ?? 0);
  const localCommission = Number(e.providerCommissionLocal ?? 0);
  const localNet = Number(e.providerNetEarningsLocal ?? e.providerNetEarningsSnapshot ?? 0);
  const hasLocal = displayCurrency !== "USD" && (localGross > 0 || localNet > 0);
  const usdToLocal = Number(e.exchangeRateUsed ?? 0) > 0
    ? 1 / Number(e.exchangeRateUsed)
    : 1;
  const toDisplay = (usd: number) => hasLocal ? usd * usdToLocal : usd;
  const grossUsd = Number(e.providerGrossEarningsUsd ?? e.grossProviderPayoutUsd ?? 0);
  const netUsd = Number(e.providerNetEarningsUsd ?? e.grossProviderPayoutUsd ?? 0);
  const commissionUsd = Math.max(0, grossUsd - netUsd);
  const offlineFeeUsd = Number(e.cashPlatformFeeDeductionUsd ?? 0);
  const settlementUsd = e.settlementAmountUsd == null ? netUsd : Number(e.settlementAmountUsd);

  return {
    providerGross: hasLocal && localGross > 0 ? localGross : toDisplay(grossUsd),
    providerCommission: hasLocal && localCommission > 0 ? localCommission : toDisplay(commissionUsd),
    providerNet: hasLocal && localNet > 0 ? localNet : toDisplay(netUsd),
    offlineFee: toDisplay(offlineFeeUsd),
    settlement: toDisplay(settlementUsd),
    fmtPay: hasLocal ? (n: number) => formatInCurrency(n, displayCurrency) : fmtUsd,
  };
}

function EarningBreakdownRow({ e, fmt }: { e: RichEarning; fmt: (n: number) => string }) {
  const {
    providerGross,
    providerCommission,
    providerNet,
    offlineFee,
    settlement,
    fmtPay,
  } = resolveEarningDisplay(e, fmt);

  return (
    <TableRow className="bg-muted/20 hover:bg-muted/30">
      <TableCell colSpan={8} className="pt-0 pb-3 px-4">
        <div className="ml-2 border-l-2 border-primary/20 pl-4 mt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* LEFT: Provider earnings waterfall */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Earnings Breakdown
              </p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Provider gross earnings</span>
                  <span className="tabular-nums font-medium">{fmtPay(providerGross)}</span>
                </div>
                {providerCommission > 0 && (
                  <div className="flex justify-between gap-4 pl-3">
                    <span className="text-muted-foreground">Provider-side commission</span>
                    <span className="tabular-nums font-medium text-orange-600">−{fmtPay(providerCommission)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t pt-1 mt-1 font-bold text-emerald-700 dark:text-emerald-400">
                  <span>Provider net earnings</span>
                  <span className="tabular-nums">{fmtPay(providerNet)}</span>
                </div>
                {offlineFee > 0 && (
                  <div className="flex justify-between gap-4 text-orange-600">
                    <span>Provider settlement deduction</span>
                    <span className="tabular-nums font-medium">−{fmtPay(offlineFee)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t pt-1 mt-1 font-bold text-emerald-700 dark:text-emerald-400">
                  <span>Settlement</span>
                  <span className="tabular-nums">{fmtPay(settlement)}</span>
                </div>
              </div>
            </div>

            {/* Appointment metadata */}
            <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground border-t pt-2">
              {e.appointmentNumber && (
                <div><span className="font-medium text-foreground">Ref:</span> {e.appointmentNumber}</div>
              )}
              {e.paymentStatus && (
                <div><span className="font-medium text-foreground">Payment:</span> {e.paymentStatus}</div>
              )}
              {e.appointmentStatus && (
                <div><span className="font-medium text-foreground">Appt status:</span> {e.appointmentStatus}</div>
              )}
              {e.paymentMethod && (
                <div><span className="font-medium text-foreground">Method:</span> {e.paymentMethod.replace("_", " ")}</div>
              )}
              {e.cancelledBy && (
                <div className="text-red-600">
                  <span className="font-medium">Cancelled by:</span> {e.cancelledBy}
                  {e.cancelledAt && ` on ${formatDate(e.cancelledAt)}`}
                </div>
              )}
              <div>
                <span className="font-medium text-foreground">Payout:</span>{" "}
                {e.status === "paid" ? "paid" : "pending"}
                {e.payoutReference ? ` · ${e.payoutReference}` : ""}
              </div>
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function ProviderEarnings() {
  const { t } = useTranslation();
  const { format: fmtMoney } = useCurrency();
  const { data, isLoading } = useQuery<EarningsPayload>({
    queryKey: QK.providerEarnings(),
  });

  const [statusFilter, setStatusFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const allEarnings = data?.earnings ?? [];

  const filteredEarnings = useMemo(() => {
    let list = allEarnings;
    if (statusFilter !== "all") list = list.filter((e) => e.paymentStatus === statusFilter);
    if (currencyFilter !== "all") {
      list = list.filter((e) => {
        const cur = e.displayCurrency ?? "USD";
        return cur === currencyFilter;
      });
    }
    if (dateFrom) list = list.filter((e) => (e.appointmentDate ?? e.createdAt.slice(0, 10)) >= dateFrom);
    if (dateTo) list = list.filter((e) => (e.appointmentDate ?? e.createdAt.slice(0, 10)) <= dateTo);
    return list;
  }, [allEarnings, statusFilter, currencyFilter, dateFrom, dateTo]);

  // Earnings are canonical net economics; settlement amount is the separate
  // amount actually paid/withdrawable from the provider wallet.
  const netPayoutUsd = (e: RichEarning) => Number(e.providerNetEarningsUsd ?? 0);
  const filteredTotal = filteredEarnings.reduce((s, e) => s + netPayoutUsd(e), 0);
  const filteredPending = filteredEarnings.filter((e) => e.status !== "paid").reduce((s, e) => s + netPayoutUsd(e), 0);
  const filteredPaid = filteredEarnings.filter((e) => e.status === "paid").reduce((s, e) => s + netPayoutUsd(e), 0);

  const isFiltered = statusFilter !== "all" || currencyFilter !== "all" || !!dateFrom || !!dateTo;
  const clearFilters = () => { setStatusFilter("all"); setCurrencyFilter("all"); setDateFrom(""); setDateTo(""); };

  const summaryTotal = isFiltered ? filteredTotal : Number(data?.summary?.totalEarnings || 0);
  const summaryPending = isFiltered ? filteredPending : Number(data?.summary?.pendingAmount || 0);
  const summaryPaid = isFiltered ? filteredPaid : Number(data?.summary?.paidAmount || 0);
  const summaryCount = isFiltered ? filteredEarnings.length : (data?.summary?.count || 0);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/provider/earnings/export", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="(.+?)"/);
      a.download = match?.[1] ?? "earnings.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <PageBreadcrumbs
        items={[{ label: "Provider Dashboard", href: "/provider/dashboard" }, { label: "Earnings" }]}
        fallback="/provider/dashboard"
      />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">

        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-earnings">
              {t("provider_earnings.title", "Earnings & Payouts")}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Per-appointment earnings history with full deduction transparency.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || allEarnings.length === 0}
            data-testid="button-export-earnings"
          >
            {exporting
              ? <><Clock className="h-3.5 w-3.5 mr-1.5 animate-spin" />Exporting…</>
              : <><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</>}
          </Button>
        </div>

        {/* ── Filter bar ── */}
        <Card className="mb-6" data-testid="card-earnings-filters">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filter earnings
              {isFiltered && (
                <button
                  onClick={clearFilters}
                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-earnings-filters"
                >
                  <X className="h-3 w-3" /> Clear filters
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Payment status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-earnings-status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-currency-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 text-xs"
                  data-testid="input-earnings-date-from"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To date</Label>
                <Input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 text-xs"
                  data-testid="input-earnings-date-to"
                />
              </div>
            </div>
            {isFiltered && (
              <p className="mt-2 text-xs text-muted-foreground" data-testid="text-filter-results">
                Showing <span className="font-semibold text-foreground">{filteredEarnings.length}</span> of {allEarnings.length} records
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card data-testid="card-total-earnings">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total net payout
                {isFiltered && <span className="ml-1 text-[10px] text-primary">(filtered)</span>}
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-32" /> : (
                <div className="text-2xl font-bold" data-testid="text-summary-total">
                  {fmtMoney(summaryTotal)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                From {summaryCount} completed appointment(s)
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-pending-payouts">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending payouts
                {isFiltered && <span className="ml-1 text-[10px] text-primary">(filtered)</span>}
              </CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-32" /> : (
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-summary-pending">
                  {fmtMoney(summaryPending)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Awaiting payout from admin</p>
            </CardContent>
          </Card>

          <Card data-testid="card-paid-amount">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Paid out
                {isFiltered && <span className="ml-1 text-[10px] text-primary">(filtered)</span>}
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-32" /> : (
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-summary-paid">
                  {fmtMoney(summaryPaid)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Already received</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Earnings table ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Earnings history
                </CardTitle>
                <CardDescription>
                  Click any row to see the full deduction breakdown for that appointment.
                </CardDescription>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs text-xs">
                    <p className="font-semibold mb-1">How your earnings are calculated:</p>
                    <p>Provider gross earnings − provider-side commission = provider net earnings.</p>
                    <p>Offline settlement deductions, when applicable, are shown separately before the final settlement amount.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredEarnings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-earnings">
                {isFiltered
                  ? "No earnings match the current filters."
                  : "No earnings yet. Complete appointments to start earning."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="pl-4 w-[160px]">Appointment date</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead className="hidden md:table-cell">Patient</TableHead>
                      <TableHead className="hidden sm:table-cell">Type</TableHead>
                      <TableHead className="text-right">Provider gross</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Provider deduction</TableHead>
                      <TableHead className="text-right">Settlement</TableHead>
                      <TableHead className="w-[130px]">Payment status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEarnings.map((e) => {
                      const expanded = expandedId === e.id;
                      const hasRefund = e.refundStatus && e.refundStatus !== "none";
                      return (
                        <>
                          <TableRow
                            key={e.id}
                            className="cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => setExpandedId(expanded ? null : e.id)}
                            data-testid={`row-earning-${e.id}`}
                          >
                            <TableCell className="pl-4" data-testid={`text-earning-date-${e.id}`}>
                              <div className="text-sm">
                                {e.appointmentDate ?? formatDate(e.createdAt)}
                              </div>
                              {e.startTime && (
                                <div className="text-xs text-muted-foreground">{e.startTime}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium max-w-[180px] truncate">
                                {e.serviceName ?? "—"}
                              </div>
                              {e.appointmentNumber && (
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  {e.appointmentNumber}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                              {patientName(e)}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {visitBadge(e.visitType)}
                            </TableCell>
                            {(() => {
                              const { providerGross, providerCommission, settlement, fmtPay } =
                                resolveEarningDisplay(e, fmtMoney);
                              return (
                                <>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {fmtPay(providerGross)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground hidden sm:table-cell">
                                    {providerCommission > 0 ? `−${fmtPay(providerCommission)}` : "—"}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400" data-testid={`text-earning-amount-${e.id}`}>
                                    {fmtPay(settlement)}
                                  </TableCell>
                                </>
                              );
                            })()}
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                {e.paymentStatus === "completed" ? (
                                  <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 text-xs" data-testid={`badge-status-${e.id}`}>
                                    Completed
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-xs" data-testid={`badge-status-${e.id}`}>
                                    {e.paymentStatus ?? "Pending"}
                                  </Badge>
                                )}
                                {hasRefund && (
                                  <Badge className="bg-red-500/10 text-red-700 border-red-500/20 text-xs" data-testid={`badge-refund-${e.id}`}>
                                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                    Refund
                                  </Badge>
                                )}
                                <button
                                  className="ml-1 text-muted-foreground hover:text-foreground"
                                  data-testid={`button-expand-${e.id}`}
                                  onClick={(ev) => { ev.stopPropagation(); setExpandedId(expanded ? null : e.id); }}
                                >
                                  {expanded
                                    ? <ChevronUp className="h-3.5 w-3.5" />
                                    : <ChevronDown className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expanded && (
                            <EarningBreakdownRow key={`${e.id}-detail`} e={e} fmt={fmtMoney} />
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Formula legend ── */}
        {!isLoading && allEarnings.length > 0 && (
          <Card className="mt-4 bg-muted/30">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start gap-2">
                <ReceiptText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p className="font-medium text-foreground">How your earnings are calculated</p>
                  <p>Provider gross earnings − provider-side deductions = provider net earnings and settlement.</p>
                  <p>Patient totals, platform fees, taxes, surcharges, and booking price lines are not included in provider earnings.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      </main>
      <Footer />
    </div>
  );
}
