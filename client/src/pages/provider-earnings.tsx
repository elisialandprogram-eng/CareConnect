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
  totalAmount: string;
  platformFee: string;
  providerEarning: string;
  status: string;
  paidAt: string | null;
  paidByUserId: string | null;
  payoutReference: string | null;
  displayCurrency: string | null;
  displayAmount: string | null;
  exchangeRateUsed: string | null;
  createdAt: string;
  // appointment context
  appointmentDate: string | null;
  startTime: string | null;
  visitType: string | null;
  appointmentNumber: string | null;
  appointmentStatus: string | null;
  paymentStatus: string | null;
  promoCode: string | null;
  promoDiscount: string | null;
  taxAmount: string | null;
  refundStatus: string | null;
  refundAmount: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  servicePriceSnapshot: string | null;
  pricingBreakdown: Record<string, unknown> | null;
  countryCode: string | null;
  appointmentPlatformFee: string | null;
  /** Booking-currency patient total from appointments.total_amount (HUF/IRR/USD). */
  appointmentTotalAmount: string | null;
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
    platformRevenue: string;
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
  { value: "all", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
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

/**
 * Resolve all display values for a single earning row using a consistent currency.
 *
 * SOURCE PRIORITY for providerEarnings / platformComm:
 *  1. pricingBreakdown JSONB (RevenueEngineResult stored at booking time) — most accurate:
 *       providerEarnings = service price − commission  (in booking currency)
 *       platformRevenue  = platform fee + commission   (in booking currency)
 *  2. Legacy fallback: platform fee from appointments.platform_fee_amount
 *  3. Last resort: provider_earnings table amounts (USD)
 *
 * The old pattern of computing platformComm = patientPaid − netEarning was WRONG because
 * it bundled tax and surcharge into "platform commission", inflating it by 1000s of HUF.
 */
function resolveEarningDisplay(
  e: RichEarning,
  fmtUsd: (n: number) => string,
): {
  patientPaid: number;
  platformComm: number;
  netEarning: number;
  refundAmt: number;
  fmtPay: (n: number) => string;
  inLocalCurrency: boolean;
} {
  const pb = e.pricingBreakdown as any;
  // pricingBreakdown is the full RevenueEngineResult stored at booking time.
  // It holds providerEarnings (service − commission) and platformRevenue (fee + commission)
  // both in booking currency (HUF/IRR/USD).
  const hasPB = pb != null && typeof pb === "object" &&
    pb.providerEarnings != null && Number(pb.providerEarnings) > 0;

  const hasLocal = !!(
    e.displayCurrency && e.displayCurrency !== "USD" &&
    e.appointmentTotalAmount != null && Number(e.appointmentTotalAmount) > 0
  );

  if (hasLocal) {
    const fmtPay = (n: number) => formatInCurrency(n, e.displayCurrency!);
    const patientPaid = Number(e.appointmentTotalAmount);
    const rate = Number(e.exchangeRateUsed ?? 0);
    const refundUsd = Number(e.refundAmount ?? 0);
    const refundAmt = rate > 0 ? refundUsd * rate : refundUsd;

    if (hasPB) {
      // Best path: engine snapshot — providerEarnings and platformRevenue in booking currency
      const netEarning   = Number(pb.providerEarnings);
      const platformComm = Number(pb.platformRevenue ?? 0);
      return { patientPaid, platformComm, netEarning, refundAmt, fmtPay, inLocalCurrency: true };
    }

    // Legacy: use stored display_amount; for platform comm prefer the appointment platform fee
    // (fee charged to patient) over the misleading patientPaid − displayAmount residual.
    const netEarning      = Number(e.displayAmount ?? 0);
    const appointmentFee  = Number(e.appointmentPlatformFee ?? 0);
    const platformComm    = appointmentFee > 0
      ? appointmentFee
      : Math.max(0, patientPaid - netEarning);
    return { patientPaid, platformComm, netEarning, refundAmt, fmtPay, inLocalCurrency: true };
  }

  // USD path
  if (hasPB) {
    // exchangeRateUsed = 1/rateVal (e.g. 1/365 ≈ 0.00274) — multiply to convert local→USD
    const xr = Number(e.exchangeRateUsed ?? 0);
    const toUSD = (n: number) => xr > 0 ? n * xr : n;
    return {
      patientPaid:   Number(e.totalAmount ?? 0),
      platformComm:  toUSD(Number(pb.platformRevenue ?? 0)),
      netEarning:    toUSD(Number(pb.providerEarnings ?? 0)),
      refundAmt:     Number(e.refundAmount ?? 0),
      fmtPay:        fmtUsd,
      inLocalCurrency: false,
    };
  }

  return {
    patientPaid:   Number(e.totalAmount ?? 0),
    platformComm:  Number(e.platformFee ?? 0),
    netEarning:    Number(e.providerEarning ?? 0),
    refundAmt:     Number(e.refundAmount ?? 0),
    fmtPay:        fmtUsd,
    inLocalCurrency: false,
  };
}

function EarningBreakdownRow({ e, fmt }: { e: RichEarning; fmt: (n: number) => string }) {
  const displayCur = e.displayCurrency ?? "USD";
  const fmtLocal = (n: number) => formatInCurrency(n, displayCur);

  const pb = e.pricingBreakdown as any;
  const hasPB = pb != null && typeof pb === "object" && Number(pb.providerEarnings ?? 0) > 0;

  // Booking-currency amounts from appointments snapshot columns
  const base  = Number(e.servicePriceSnapshot ?? 0);
  const promo = Number(e.promoDiscount ?? 0);
  const tax   = Number(e.taxAmount ?? 0);

  // Commission deducted from provider's share (from revenue engine, in booking currency)
  const commissionAmt  = hasPB ? Number(pb.commissionAmount ?? 0) : 0;
  const commissionRate = hasPB && pb.commissionRate != null
    ? Math.round(Number(pb.commissionRate) * 100)
    : null;

  // Platform fee charged TO the patient (not the commission) — in booking currency
  const apptPlatformFee = Number(e.appointmentPlatformFee ?? 0);

  // Resolved totals — uses pricingBreakdown snapshot when available (see resolveEarningDisplay)
  const { patientPaid, platformComm, netEarning, refundAmt, fmtPay } =
    resolveEarningDisplay(e, fmt);

  // Pricing detail lines (patient-facing breakdown from booking snapshot)
  const rawPricingLines = pb?.lines as Array<{ label: string; amount: number }> | undefined;
  const pricingLines = rawPricingLines?.map((l) =>
    /platform\s*fee/i.test(l.label) && l.amount === 0 && apptPlatformFee > 0
      ? { ...l, amount: apptPlatformFee }
      : l,
  );

  // What to show for the commission deduction line:
  // If we have the exact commission from the engine, use it; otherwise fall back to platformComm
  const showCommissionAmt = commissionAmt > 0 ? commissionAmt : 0;

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
                {/* Service price */}
                {base > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Service price</span>
                    <span className="tabular-nums font-medium">{fmtLocal(base)}</span>
                  </div>
                )}
                {/* Promo discount off service price */}
                {promo > 0 && (
                  <div className="flex justify-between gap-4 pl-3">
                    <span className="text-muted-foreground">
                      Promo discount{e.promoCode ? ` (${e.promoCode})` : ""}
                    </span>
                    <span className="tabular-nums font-medium text-amber-600">−{fmtLocal(promo)}</span>
                  </div>
                )}
                {/* Platform commission deducted from provider's service revenue */}
                {showCommissionAmt > 0 && (
                  <div className="flex justify-between gap-4 pl-3">
                    <span className="text-muted-foreground">
                      Platform commission{commissionRate != null ? ` (${commissionRate}%)` : ""}
                    </span>
                    <span className="tabular-nums font-medium text-orange-600">−{fmtPay(showCommissionAmt)}</span>
                  </div>
                )}
                {/* Net earning */}
                <div className="flex justify-between gap-4 border-t pt-1 mt-1 font-bold text-emerald-700 dark:text-emerald-400">
                  <span>Your net earning</span>
                  <span className="tabular-nums">{fmtPay(netEarning)}</span>
                </div>
                {/* Refund (if any) */}
                {refundAmt > 0 && (
                  <div className="flex justify-between gap-4 text-red-600">
                    <span>Refund issued</span>
                    <span className="tabular-nums font-medium">−{fmtPay(refundAmt)}</span>
                  </div>
                )}

                {/* Patient payment context */}
                <div className="border-t pt-2 mt-2 space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Patient payment
                  </p>
                  {apptPlatformFee > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Platform fee (billed to patient)</span>
                      <span className="tabular-nums text-muted-foreground">{fmtPay(apptPlatformFee)}</span>
                    </div>
                  )}
                  {tax > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Tax</span>
                      <span className="tabular-nums text-muted-foreground">{fmtLocal(tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 font-semibold">
                    <span>Patient paid total</span>
                    <span className="tabular-nums">{fmtPay(patientPaid)}</span>
                  </div>
                  {platformComm > 0 && (
                    <div className="flex justify-between gap-4 text-[11px] text-muted-foreground">
                      <span>Platform total take (fee + commission)</span>
                      <span className="tabular-nums">−{fmtPay(platformComm)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: Patient-facing booking price detail */}
            {pricingLines && pricingLines.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Booking price detail
                </p>
                <div className="space-y-1 text-sm">
                  {pricingLines.map((l, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{l.label}</span>
                      <span className="tabular-nums">{fmtLocal(l.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
              {e.cancelledBy && (
                <div className="text-red-600">
                  <span className="font-medium">Cancelled by:</span> {e.cancelledBy}
                  {e.cancelledAt && ` on ${formatDate(e.cancelledAt)}`}
                </div>
              )}
              {e.payoutReference && (
                <div><span className="font-medium text-foreground">Payout ref:</span> {e.payoutReference}</div>
              )}
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
    if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
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

  const filteredTotal = filteredEarnings.reduce((s, e) => s + Number(e.providerEarning || 0), 0);
  const filteredPending = filteredEarnings.filter((e) => e.status !== "paid").reduce((s, e) => s + Number(e.providerEarning || 0), 0);
  const filteredPaid = filteredEarnings.filter((e) => e.status === "paid").reduce((s, e) => s + Number(e.providerEarning || 0), 0);

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
                <Label className="text-xs">Status</Label>
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
                Total net earnings
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
                    <p>Service Price − Promo Discount = Subtotal</p>
                    <p>Subtotal − Platform Commission = <span className="font-semibold">Your Net Earning</span></p>
                    <p className="mt-1 text-muted-foreground">The patient additionally pays a platform fee and applicable tax — these do not affect your net earning.</p>
                    <p className="mt-1 text-muted-foreground">Platform take = Platform fee + Commission</p>
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
                      <TableHead className="text-right">Patient paid</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Platform take</TableHead>
                      <TableHead className="text-right">Your earning</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEarnings.map((e) => {
                      const expanded = expandedId === e.id;
                      const hasRefund = e.refundStatus && e.refundStatus !== "none" && Number(e.refundAmount ?? 0) > 0;
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
                              const { patientPaid, platformComm, netEarning, fmtPay } =
                                resolveEarningDisplay(e, fmtMoney);
                              return (
                                <>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {fmtPay(patientPaid)}
                                    {Number(e.promoDiscount ?? 0) > 0 && (
                                      <div className="text-[10px] text-amber-600">
                                        −{formatInCurrency(Number(e.promoDiscount), e.displayCurrency ?? "USD")} promo
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground hidden sm:table-cell">
                                    −{fmtPay(platformComm)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400" data-testid={`text-earning-amount-${e.id}`}>
                                    {fmtPay(netEarning)}
                                  </TableCell>
                                </>
                              );
                            })()}
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                {e.status === "paid" ? (
                                  <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 text-xs" data-testid={`badge-status-${e.id}`}>
                                    Paid
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-xs" data-testid={`badge-status-${e.id}`}>
                                    Pending
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
                  <p>Service Price − Promo Discount = Subtotal &nbsp;·&nbsp; Subtotal − Platform Commission = <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Your Net Earning</span></p>
                  <p>The patient separately pays a platform fee and applicable tax. Platform take = platform fee + commission. All values stored in USD and displayed in your local currency.</p>
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
