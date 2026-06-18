import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDate as fmtDate } from "@/lib/datetime";
import { useCurrency } from "@/lib/currency";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Wallet, TrendingUp, ArrowDownToLine, History, AlertTriangle, LockKeyhole,
  ChevronDown, ChevronUp, RefreshCw, ShieldAlert, Phone,
} from "lucide-react";

interface ProviderWallet {
  id: string;
  providerId: string;
  availableBalance: string;
  pendingBalance: string;
  heldBalance: string;
  lifetimeEarnings: string;
  currency: string;
  isFrozen: boolean;
  frozenReason: string | null;
  lastPayoutDate: string | null;
  updatedAt: string | null;
}

interface LedgerEntry {
  id: string;
  providerId: string;
  amount: string;
  entryType: string;
  referenceId: string | null;
  description: string | null;
  balanceAfter: string | null;
  createdAt: string;
}

interface MonthlyRow {
  month: string;
  gross_income: string;
  payouts: string;
  booking_count: string;
}

interface Breakdown {
  net_income: string | null;
  platform_fees: string | null;
  tax_withheld: string | null;
  commission: string | null;
  total_bookings: string | null;
}


function entryTypeBadge(type: string) {
  const map: Record<string, { label: string; color: string }> = {
    booking_income:       { label: "Income",         color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    platform_fee_deduction: { label: "Platform fee", color: "bg-slate-100 text-slate-700 border-slate-200" },
    tax_deduction:        { label: "Tax",             color: "bg-slate-100 text-slate-700 border-slate-200" },
    commission_deduction: { label: "Commission",      color: "bg-slate-100 text-slate-700 border-slate-200" },
    payout_held:          { label: "Payout held",     color: "bg-amber-100 text-amber-800 border-amber-200" },
    payout_deduction:     { label: "Payout sent",     color: "bg-blue-100 text-blue-800 border-blue-200" },
    payout_returned:      { label: "Returned",        color: "bg-purple-100 text-purple-800 border-purple-200" },
    manual_correction:    { label: "Adjustment",      color: "bg-orange-100 text-orange-800 border-orange-200" },
    wallet_adjustment:    { label: "Adjustment",      color: "bg-orange-100 text-orange-800 border-orange-200" },
  };
  const meta = map[type] ?? { label: type, color: "bg-muted text-foreground border-border" };
  return <Badge className={`text-xs ${meta.color} border`}>{meta.label}</Badge>;
}

function formatDate(s: string | null | undefined) {
  return fmtDate(s, { day: "2-digit", month: "short", year: "numeric" }) || "—";
}

function formatMonthLabel(m: string) {
  const [y, mon] = m.split("-");
  const d = new Date(Number(y), Number(mon) - 1, 1);
  return fmtDate(d, { month: "short", year: "2-digit" }) || m;
}

export function ProviderWalletPanel() {
  const { toast } = useToast();
  const { format: fmt } = useCurrency();
  const [showAll, setShowAll] = useState(false);

  const { data: wallet, isLoading: walletLoading } = useQuery<ProviderWallet>({
    queryKey: ["/api/provider/wallet"],
  });

  const { data: ledger = [], isLoading: ledgerLoading } = useQuery<LedgerEntry[]>({
    queryKey: ["/api/provider/wallet/ledger"],
  });

  const { data: monthly = [], isLoading: monthlyLoading } = useQuery<MonthlyRow[]>({
    queryKey: ["/api/provider/wallet/monthly"],
  });

  const { data: breakdown } = useQuery<Breakdown>({
    queryKey: ["/api/provider/wallet/breakdown"],
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/provider/wallet"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/provider/wallet/ledger"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/provider/wallet/monthly"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/provider/wallet/breakdown"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/provider/payout-requests"] }),
      ]);
    },
    onSuccess: () => toast({ title: "Wallet refreshed" }),
  });

  const available = Number(wallet?.availableBalance ?? 0);
  const held = Number(wallet?.heldBalance ?? 0);
  const lifetime = Number(wallet?.lifetimeEarnings ?? 0);
  const frozen = wallet?.isFrozen ?? false;

  const chartData = monthly.map((row) => ({
    month: formatMonthLabel(row.month),
    "Income": Number(row.gross_income || 0),
    "Payouts": Number(row.payouts || 0),
  }));

  const displayedLedger = showAll ? ledger : ledger.slice(0, 10);

  return (
    <div className="space-y-6" data-testid="provider-wallet-panel">
      {frozen && (() => {
        const reason = wallet?.frozenReason ?? null;
        const isSystemHold = reason?.startsWith("System: Auto-locked") ?? false;
        return (
          <div className="rounded-xl border border-red-200 overflow-hidden shadow-sm" data-testid="alert-wallet-frozen">
            {/* Header bar */}
            <div className="flex items-start gap-3 bg-red-50 px-4 py-4">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                <LockKeyhole className="h-5 w-5 text-red-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-red-800 text-sm leading-tight">
                  {isSystemHold ? "Wallet locked by automated audit" : "Wallet frozen by administrator"}
                </p>
                <p className="text-xs text-red-700 mt-0.5 leading-snug">
                  {isSystemHold
                    ? "The system detected a ledger discrepancy and paused payouts automatically."
                    : "An administrator has paused your payout capability."}
                </p>
              </div>
            </div>

            {/* Reason & guidance */}
            <div className="bg-white border-t border-red-100 px-4 py-4 space-y-3">
              {reason && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600 mb-1">
                    {isSystemHold ? "System message" : "Reason provided"}
                  </p>
                  <p className="text-sm text-red-800 leading-snug">{reason}</p>
                </div>
              )}

              <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800 mb-1">What this means</p>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      {isSystemHold
                        ? "Your existing balance is safe — no funds have been removed. Our finance team will review the discrepancy and clear the hold once verified. This usually resolves within 1–2 business days."
                        : "Your balance is secure. No withdrawals can be processed until the freeze is lifted. Please contact support for assistance."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Need help?{" "}
                  <a
                    href="mailto:support@goldenlife.com"
                    className="font-medium text-foreground underline underline-offset-2 hover:text-primary transition-colors"
                  >
                    Contact support
                  </a>
                  {" "}and quote reference:{" "}
                  <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                    {isSystemHold ? "WALLET-AUDIT-HOLD" : "WALLET-ADMIN-FREEZE"}
                  </span>
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="card-wallet-available">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" /> Available
            </CardDescription>
          </CardHeader>
          <CardContent>
            {walletLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="text-2xl font-bold text-emerald-600" data-testid="text-wallet-available">
                {fmt(available)}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">Ready to withdraw</p>
          </CardContent>
        </Card>

        <Card data-testid="card-wallet-held">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <ArrowDownToLine className="h-3.5 w-3.5" /> In payout requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            {walletLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="text-2xl font-bold text-amber-600" data-testid="text-wallet-held">
                {fmt(held)}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">Awaiting admin approval</p>
          </CardContent>
        </Card>

        <Card data-testid="card-wallet-lifetime">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Lifetime earned
            </CardDescription>
          </CardHeader>
          <CardContent>
            {walletLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="text-2xl font-bold" data-testid="text-wallet-lifetime">
                {fmt(lifetime)}
              </p>
            )}
            {wallet?.lastPayoutDate && (
              <p className="text-xs text-muted-foreground mt-1">
                Last payout: {formatDate(wallet.lastPayoutDate)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="chart">
        <div className="flex items-center justify-between mb-3">
          <TabsList>
            <TabsTrigger value="chart" data-testid="tab-wallet-chart">Earnings chart</TabsTrigger>
            <TabsTrigger value="ledger" data-testid="tab-wallet-ledger">Transaction history</TabsTrigger>
            <TabsTrigger value="breakdown" data-testid="tab-wallet-breakdown">This month</TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            data-testid="btn-wallet-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* ── Monthly earnings chart ── */}
        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly earnings — last 12 months</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : monthly.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                  <TrendingUp className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No earnings data yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => fmt(value)} />
                    <Legend />
                    <Bar dataKey="Income" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Payouts" fill="hsl(var(--muted-foreground) / 0.4)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Transaction history / ledger ── */}
        <TabsContent value="ledger">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transaction history</CardTitle>
              <CardDescription>All credits and debits on your wallet</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {ledgerLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : ledger.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                  <History className="h-7 w-7 opacity-30" />
                  <p className="text-sm">No transactions yet</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Description</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground hidden md:table-cell">Balance after</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedLedger.map((entry) => {
                          const amt = Number(entry.amount);
                          return (
                            <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-ledger-${entry.id}`}>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(entry.createdAt)}</td>
                              <td className="px-4 py-2.5">{entryTypeBadge(entry.entryType)}</td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate hidden sm:table-cell">
                                {entry.description ?? "—"}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-medium tabular-nums text-sm ${amt >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {amt >= 0 ? "+" : ""}{fmt(amt)}
                              </td>
                              <td className="px-4 py-2.5 text-right text-xs text-muted-foreground hidden md:table-cell">
                                {entry.balanceAfter != null ? fmt(Number(entry.balanceAfter)) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {ledger.length > 10 && (
                    <div className="p-4 border-t text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAll(!showAll)}
                        data-testid="btn-ledger-toggle"
                      >
                        {showAll ? (
                          <><ChevronUp className="h-4 w-4 mr-1" /> Show less</>
                        ) : (
                          <><ChevronDown className="h-4 w-4 mr-1" /> Show all {ledger.length} entries</>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── This month breakdown ── */}
        <TabsContent value="breakdown">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">This month's breakdown</CardTitle>
              <CardDescription>Summary of income, fees, and tax for the current calendar month</CardDescription>
            </CardHeader>
            <CardContent>
              {!breakdown ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Net income</p>
                      <p className="text-lg font-bold text-emerald-600" data-testid="text-breakdown-net">
                        {fmt(Number(breakdown.net_income || 0))}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Bookings</p>
                      <p className="text-lg font-bold" data-testid="text-breakdown-bookings">
                        {breakdown.total_bookings || 0}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Platform fees</p>
                      <p className="text-lg font-semibold text-red-600" data-testid="text-breakdown-fees">
                        −{fmt(Number(breakdown.platform_fees || 0))}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Tax withheld</p>
                      <p className="text-lg font-semibold text-red-600" data-testid="text-breakdown-tax">
                        −{fmt(Number(breakdown.tax_withheld || 0))}
                      </p>
                    </div>
                  </div>
                  {(Number(breakdown.commission || 0) > 0) && (
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Commission</p>
                      <p className="text-lg font-semibold text-red-600" data-testid="text-breakdown-commission">
                        −{fmt(Number(breakdown.commission || 0))}
                      </p>
                    </div>
                  )}
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground mb-1">Gross received by clients</p>
                    <p className="text-lg font-bold" data-testid="text-breakdown-gross">
                      {fmt(
                        Number(breakdown.net_income || 0) +
                        Number(breakdown.platform_fees || 0) +
                        Number(breakdown.tax_withheld || 0) +
                        Number(breakdown.commission || 0)
                      )}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {wallet?.updatedAt && (
        <p className="text-xs text-muted-foreground text-right">
          Last updated: {formatDate(wallet.updatedAt)}
        </p>
      )}
    </div>
  );
}
