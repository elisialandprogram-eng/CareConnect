import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Filter, Loader2, RefreshCw, X, ChevronLeft, ChevronRight, Receipt, DollarSign, Percent, Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAdminCurrency } from "@/lib/currency";

type ReportRow = {
  id: string;
  appointment_number: string | null;
  created_at: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  country_code: string;
  booking_currency: string;
  booking_amount: string | number;
  patient_id: string;
  patient_name: string;
  patient_email: string | null;
  provider_id: string;
  provider_name: string;
  provider_email: string | null;
  service_name: string | null;
  commission_usd: string | number;
  platform_fee_usd: string | number;
  gateway_fee_tax_usd: string | number;
  service_tax_usd: string | number;
  platform_tax_usd: string | number;
  other_tax_usd: string | number;
  admin_fee_usd: string | number;
  gross_amount_usd: string | number;
};

type ReportSummary = {
  bookingCount: number;
  earnedBookingCount: number;
  commissionUsd: number;
  platformFeeUsd: number;
  gatewayFeeTaxUsd: number;
  serviceTaxUsd: number;
  platformTaxUsd: number;
  otherTaxUsd: number;
  adminFeeUsd: number;
  totalTaxesUsd: number;
  totalPlatformEarningsUsd: number;
};

type ReportResponse = {
  rows: ReportRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: ReportSummary;
};

type ReportFilterOption = { id: string; name: string | null; email: string | null };
type ReportFilters = { providers: ReportFilterOption[]; clients: ReportFilterOption[] };

function authFetch(url: string) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
  }).then(async response => {
    if (!response.ok) throw new Error(await response.text() || "Request failed");
    return response.json();
  });
}

function amount(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
  });
}

function statusLabel(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "unpaid";
}

export function PlatformRevenueReport() {
  const { toast } = useToast();
  const { format } = useAdminCurrency();
  const [providerId, setProviderId] = useState("");
  const [clientId, setClientId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [month, setMonth] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data: filterOptions } = useQuery<ReportFilters>({
    queryKey: ["/api/admin/financial/platform-revenue/filters"],
    queryFn: () => authFetch("/api/admin/financial/platform-revenue/filters"),
    staleTime: 5 * 60 * 1000,
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (providerId) params.set("providerId", providerId);
    if (clientId) params.set("patientId", clientId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (month) params.set("month", month);
    if (paymentStatus !== "all") params.set("paymentStatus", paymentStatus);
    return params.toString();
  }, [page, providerId, clientId, dateFrom, dateTo, month, paymentStatus]);

  const { data, isLoading, isFetching, refetch } = useQuery<ReportResponse>({
    queryKey: ["/api/admin/financial/platform-revenue", queryString],
    queryFn: () => authFetch(`/api/admin/financial/platform-revenue?${queryString}`),
    placeholderData: previous => previous,
  });

  const summary = data?.summary;
  const rows = data?.rows ?? [];

  function clearFilters() {
    setProviderId("");
    setClientId("");
    setDateFrom("");
    setDateTo("");
    setMonth("");
    setPaymentStatus("all");
    setPage(1);
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (providerId) params.set("providerId", providerId);
    if (clientId) params.set("patientId", clientId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (month) params.set("month", month);
    if (paymentStatus !== "all") params.set("paymentStatus", paymentStatus);
    params.set("limit", "100000");
    fetch(`/api/admin/financial/platform-revenue/export/csv?${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
    }).then(async response => {
      if (!response.ok) throw new Error(await response.text() || "Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `platform-revenue-report-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }).catch(error => {
      console.error("[platform-revenue-export]", error);
      toast({ title: "Export failed", description: "The report could not be downloaded.", variant: "destructive" });
    });
  }

  const cards = summary ? [
    { label: "Platform commission", value: summary.commissionUsd, icon: Percent, tone: "text-violet-600" },
    { label: "Platform fee", value: summary.platformFeeUsd, icon: DollarSign, tone: "text-blue-600" },
    { label: "Gateway fee / tax", value: summary.gatewayFeeTaxUsd, icon: Landmark, tone: "text-amber-600" },
    { label: "Service tax", value: summary.serviceTaxUsd, icon: Receipt, tone: "text-orange-600" },
    { label: "Platform tax", value: summary.platformTaxUsd, icon: Receipt, tone: "text-orange-600" },
    { label: "Other tax", value: summary.otherTaxUsd, icon: Receipt, tone: "text-orange-600" },
    { label: "All taxes", value: summary.totalTaxesUsd, icon: Receipt, tone: "text-red-600" },
    { label: "Platform income (excl. taxes)", value: summary.totalPlatformEarningsUsd, icon: DollarSign, tone: "text-emerald-600" },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Platform Revenue by Booking
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Commission, platform fee, gateway fee/tax, and tax snapshots normalized to USD.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 me-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={exportCsv} disabled={isLoading}>
            <Download className="h-4 w-4 me-2" />
            Download CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                  <Icon className={`h-4 w-4 ${card.tone}`} />
                </div>
                <p className="text-xl font-bold mt-2">{format(card.value)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Report filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-1 xl:col-span-2">
              <label className="text-xs font-medium">Provider</label>
              <select
                value={providerId}
                onChange={event => { setProviderId(event.target.value); setPage(1); }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All providers</option>
                {(filterOptions?.providers ?? []).map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name || option.email || option.id}
                    {option.name && option.email ? ` · ${option.email}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 xl:col-span-2">
              <label className="text-xs font-medium">Client</label>
              <select
                value={clientId}
                onChange={event => { setClientId(event.target.value); setPage(1); }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All clients</option>
                {(filterOptions?.clients ?? []).map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name || option.email || option.id}
                    {option.name && option.email ? ` · ${option.email}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Month</label>
              <Input type="month" value={month} onChange={event => { setMonth(event.target.value); setPage(1); }} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Payment status</label>
              <select
                value={paymentStatus}
                onChange={event => { setPaymentStatus(event.target.value); setPage(1); }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All payment statuses</option>
                <option value="paid">Paid</option>
                <option value="partially_refunded">Partially refunded</option>
                <option value="refunded">Refunded</option>
                <option value="disputed">Disputed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">From date</label>
              <Input type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1); }} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">To date</label>
              <Input type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1); }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
            <p className="text-xs text-muted-foreground">
              Date range takes precedence over month when both are supplied. Totals include paid and refunded payment records.
            </p>
            {(providerId || clientId || dateFrom || dateTo || month || paymentStatus !== "all") && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 me-1" />
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Booking earnings
              {data && <span className="text-muted-foreground font-normal ms-2">({data.total.toLocaleString()} bookings)</span>}
            </CardTitle>
            {summary && (
              <Badge variant="secondary">
                {summary.earnedBookingCount.toLocaleString()} with recognized payment
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-xs text-muted-foreground">
                  <th className="text-start font-medium p-3 whitespace-nowrap">Booking</th>
                  <th className="text-start font-medium p-3 whitespace-nowrap">Provider</th>
                  <th className="text-start font-medium p-3 whitespace-nowrap">Client</th>
                  <th className="text-start font-medium p-3 whitespace-nowrap">Payment</th>
                  <th className="text-end font-medium p-3 whitespace-nowrap">Commission</th>
                  <th className="text-end font-medium p-3 whitespace-nowrap">Platform fee</th>
                  <th className="text-end font-medium p-3 whitespace-nowrap">Gateway fee/tax</th>
                  <th className="text-end font-medium p-3 whitespace-nowrap">Service tax</th>
                  <th className="text-end font-medium p-3 whitespace-nowrap">Platform tax</th>
                  <th className="text-end font-medium p-3 whitespace-nowrap">Other tax</th>
                  <th className="text-end font-medium p-3 whitespace-nowrap">Admin fee</th>
                  <th className="text-end font-medium p-3 whitespace-nowrap">Platform income</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={12} className="p-10 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline me-2" />Loading report…
                  </td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={12} className="p-10 text-center text-muted-foreground">No bookings match these filters.</td></tr>
                )}
                {!isLoading && rows.map(row => {
                  const totalPlatform = amount(row.commission_usd) + amount(row.platform_fee_usd)
                    + amount(row.gateway_fee_tax_usd) + amount(row.admin_fee_usd);
                  return (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-3 whitespace-nowrap">
                        <div className="font-medium">{row.appointment_number || row.id.slice(0, 8)}</div>
                        <div className="text-xs text-muted-foreground">{dateLabel(row.created_at)} · {row.booking_currency}</div>
                      </td>
                      <td className="p-3 min-w-[150px]">
                        <div className="font-medium">{row.provider_name || "—"}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{row.provider_email || row.provider_id}</div>
                      </td>
                      <td className="p-3 min-w-[150px]">
                        <div className="font-medium">{row.patient_name || "—"}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{row.patient_email || row.patient_id}</div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <Badge variant="outline" className="capitalize">{statusLabel(row.payment_status)}</Badge>
                        <div className="text-xs text-muted-foreground mt-1 capitalize">{statusLabel(row.payment_method)}</div>
                      </td>
                      <td className="p-3 text-end font-medium">{format(amount(row.commission_usd))}</td>
                      <td className="p-3 text-end">{format(amount(row.platform_fee_usd))}</td>
                      <td className="p-3 text-end">{format(amount(row.gateway_fee_tax_usd))}</td>
                      <td className="p-3 text-end">{format(amount(row.service_tax_usd))}</td>
                      <td className="p-3 text-end">{format(amount(row.platform_tax_usd))}</td>
                      <td className="p-3 text-end">{format(amount(row.other_tax_usd))}</td>
                      <td className="p-3 text-end">{format(amount(row.admin_fee_usd))}</td>
                      <td className="p-3 text-end font-semibold text-emerald-700 dark:text-emerald-400">{format(totalPlatform)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {data ? `Page ${data.page} of ${Math.max(1, data.totalPages)}` : "—"}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!data || page <= 1 || isFetching} onClick={() => setPage(value => value - 1)}>
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={!data || page >= data.totalPages || isFetching} onClick={() => setPage(value => value + 1)}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <p className="text-xs text-muted-foreground">
          Tax detail: service {format(summary.serviceTaxUsd)}, platform {format(summary.platformTaxUsd)}, other {format(summary.otherTaxUsd)}.
          Stored booking-currency snapshots are converted proportionally against the authoritative final USD booking total.
        </p>
      )}
    </div>
  );
}

export default PlatformRevenueReport;