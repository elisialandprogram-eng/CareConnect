import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminCurrency } from "@/lib/currency";
import { useTranslation } from "react-i18next";

type SettlementRow = {
  id: string;
  provider_name: string;
  country_code: string;
  appointment_number?: string | null;
  appointment_date?: string | null;
  payment_method: string;
  service_earnings_usd: string;
  tax_pass_through_usd: string;
  gross_provider_payout_usd: string;
  cash_platform_fee_deduction_usd: string;
  cash_platform_fee_applied_usd: string;
  final_settlement_usd: string;
  deduction_status: "pending" | "applied";
};

export function CashFeeSettlementsPanel() {
  const { t } = useTranslation();
  const { format } = useAdminCurrency();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  if (paymentMethod !== "all") query.set("paymentMethod", paymentMethod);
  if (status !== "all") query.set("status", status);
  const queryString = query.toString();
  const { data: rows = [], isLoading, refetch } = useQuery<SettlementRow[]>({
    queryKey: ["/api/admin/cash-fee-settlements", queryString],
    queryFn: () => fetch(`/api/admin/cash-fee-settlements${queryString ? `?${queryString}` : ""}`, { credentials: "include" }).then((r) => r.json()),
  });
  const exportUrl = `/api/admin/cash-fee-settlements/export${queryString ? `?${queryString}` : ""}`;
  const totalFee = rows.reduce((sum, row) => sum + Number(row.cash_platform_fee_deduction_usd || 0), 0);
  const appliedFee = rows.reduce((sum, row) => sum + Number(row.cash_platform_fee_applied_usd || 0), 0);

  return (
    <Card data-testid="card-cash-fee-settlements">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>{t("admin.cash_fee_title")}</CardTitle>
            <CardDescription>{t("admin.cash_fee_desc")}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-1" />{t("admin.refresh")}</Button>
            <Button variant="outline" size="sm" asChild><a href={exportUrl} download><Download className="h-4 w-4 mr-1" />{t("admin.csv")}</a></Button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label={t("admin.date_from")} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label={t("admin.date_to")} />
          <Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue placeholder={t("admin.payment_method")} /></SelectTrigger><SelectContent><SelectItem value="all">{t("admin.all_methods")}</SelectItem><SelectItem value="cash">{t("admin.cash")}</SelectItem><SelectItem value="bank_transfer">{t("admin.bank_transfer")}</SelectItem></SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue placeholder={t("admin.deduction_status")} /></SelectTrigger><SelectContent><SelectItem value="all">{t("admin.all_statuses")}</SelectItem><SelectItem value="pending">{t("status.pending")}</SelectItem><SelectItem value="applied">{t("admin.applied")}</SelectItem></SelectContent></Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-5 text-sm mb-4">
          <span>{t("admin.fee_due")}: <strong>{format(totalFee)}</strong></span>
          <span>{t("admin.applied")}: <strong className="text-emerald-700">{format(appliedFee)}</strong></span>
          <span>{t("admin.rows")}: <strong>{rows.length}</strong></span>
        </div>
        {isLoading ? <div className="h-32 rounded-lg bg-muted animate-pulse" /> : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{t("admin.cash_fee_empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">{t("admin.provider")}</th><th className="p-2">{t("admin.appointment")}</th><th className="p-2">{t("admin.method")}</th><th className="p-2 text-right">{t("admin.service")}</th><th className="p-2 text-right">{t("admin.tax_passed_through")}</th><th className="p-2 text-right">{t("admin.fee")}</th><th className="p-2 text-right">{t("admin.final_settlement")}</th><th className="p-2">{t("admin.status")}</th></tr></thead>
              <tbody>{rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="p-2"><div className="font-medium">{row.provider_name}</div><div className="text-xs text-muted-foreground">{row.country_code}</div></td>
                  <td className="p-2">{row.appointment_number || row.id.slice(0, 8)}<div className="text-xs text-muted-foreground">{row.appointment_date || "—"}</div></td>
                  <td className="p-2 capitalize">{row.payment_method.replace("_", " ")}</td>
                  <td className="p-2 text-right">{format(Number(row.service_earnings_usd || 0))}</td>
                  <td className="p-2 text-right text-emerald-700">{format(Number(row.tax_pass_through_usd || 0))}</td>
                  <td className="p-2 text-right text-amber-700">{format(Number(row.cash_platform_fee_deduction_usd || 0))}</td>
                  <td className="p-2 text-right font-medium">{format(Number(row.final_settlement_usd || 0))}</td>
                  <td className="p-2"><Badge variant={row.deduction_status === "applied" ? "secondary" : "outline"}>{row.deduction_status}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}