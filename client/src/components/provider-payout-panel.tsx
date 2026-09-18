import { formatDate } from "@/lib/datetime";
import { formatCount } from "@/lib/format-utils";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Banknote, ArrowDownToLine, Clock, CheckCircle2, XCircle, AlertCircle, Wallet, TrendingUp, History } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { useTranslation } from "react-i18next";

interface PayoutSummary {
  availableBalance: number;
  grossAvailableBalance: number;
  outstandingWalletDebt?: number;
  pendingSettlementDeduction: number;
  finalAvailableBalance: number;
  cashBookingCount: number;
  pendingPayouts: number;
  lifetimePaidOut: number;
  lifetimePaidEarnings: number;
  currency: string;
}

interface PayoutRequest {
  id: string;
  amount: string;
  currency: string;
  method: string;
  bank_name: string | null;
  account_holder: string | null;
  status: string;
  admin_note: string | null;
  payment_reference: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  paid_at: string | null;
  created_at: string;
}

function statusBadge(status: string, t: any) {
  switch (status) {
    case "pending":  return <Badge className="bg-amber-100 text-amber-800 border-amber-200">{t("provider_dashboard.pending_review", "Pending review")}</Badge>;
    case "approved": return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{t("provider_dashboard.approved", "Approved")}</Badge>;
    case "paid":     return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{t("provider_dashboard.paid", "Paid")}</Badge>;
    case "rejected": return <Badge className="bg-red-100 text-red-800 border-red-200">{t("provider_dashboard.rejected", "Rejected")}</Badge>;
    default:         return <Badge variant="outline">{status}</Badge>;
  }
}

function statusIcon(status: string) {
  if (status === "paid")     return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "approved") return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
  if (status === "rejected") return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-amber-500" />;
}

export function ProviderPayoutPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { format: fmt, convert, code } = useCurrency();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumberMasked, setAccountNumberMasked] = useState("");
  const [notes, setNotes] = useState("");

  const { data: summary, isLoading: summaryLoading } = useQuery<PayoutSummary>({
    queryKey: ["/api/provider/payout-summary"],
  });

  const { data: requests, isLoading: requestsLoading } = useQuery<PayoutRequest[]>({
    queryKey: ["/api/provider/payout-requests"],
  });

  const { data: providerProfile } = useQuery<any>({
    queryKey: ["/api/provider/me"],
  });

  useEffect(() => {
    if (dialogOpen && providerProfile) {
      if (providerProfile.bankName) setBankName(providerProfile.bankName);
      if (providerProfile.accountHolder) setAccountHolder(providerProfile.accountHolder);
      if (providerProfile.accountNumber) setAccountNumberMasked(`****${String(providerProfile.accountNumber).slice(-4)}`);
    }
  }, [dialogOpen, providerProfile]);

  const createMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/provider/payout-requests", body),
    onSuccess: () => {
      toast({ title: t("provider_dashboard.payout_submitted", "Payout request submitted"), description: t("provider_dashboard.payout_review_shortly", "Admin will review your request shortly.") });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/payout-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/payout-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/wallet/ledger"] });
      setDialogOpen(false);
      setAmount(""); setBankName(""); setAccountHolder(""); setAccountNumberMasked(""); setNotes("");
    },
    onError: (e: any) => toast({ title: t("provider_dashboard.failed_to_submit", "Failed to submit"), description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/provider/payout-requests/${id}`),
    onSuccess: () => {
      toast({ title: t("provider_dashboard.payout_cancelled", "Payout request cancelled"), description: t("provider_dashboard.payout_funds_returned", "Your funds have been returned to your available balance.") });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/payout-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/payout-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/wallet/ledger"] });
    },
    onError: (e: any) => toast({ title: t("provider_dashboard.failed_to_cancel", "Failed to cancel"), description: e.message, variant: "destructive" }),
  });

  const hasOpenRequest = requests?.some(r => r.status === "pending" || r.status === "approved");
  const available = summary?.availableBalance ?? 0;

  function handleSubmit() {
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) { toast({ title: t("provider_dashboard.enter_valid_amount", "Enter a valid amount"), variant: "destructive" }); return; }
    const availableLocal = convert(available);
    if (n > availableLocal + 0.5) { toast({ title: t("provider_dashboard.amount_exceeds_balance", "Amount exceeds available balance"), variant: "destructive" }); return; }
    createMutation.mutate({ amount: n, method, bankName, accountHolder, accountNumberMasked, notes });
  }

  return (
    <div className="space-y-6">
      {/* Balance Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summaryLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md" data-testid="card-available-balance">
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-xl" />
              <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/80">{t("provider_dashboard.final_withdrawable_balance", "Final withdrawable balance")}</p>
                <Wallet className="h-4 w-4 text-white/70" />
              </div>
              <p className="text-3xl font-bold mt-2" data-testid="text-available-balance">{fmt(available)}</p>
                <p className="text-[11px] text-white/70 mt-1">{t("provider_dashboard.after_settlement_deductions", "After pending settlement deductions")}</p>
            </div>

            <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md" data-testid="card-pending-payout">
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-xl" />
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/80">{t("provider_dashboard.in_flight_payouts", "In-flight payouts")}</p>
                <Clock className="h-4 w-4 text-white/70" />
              </div>
              <p className="text-3xl font-bold mt-2" data-testid="text-pending-payout">{fmt(summary?.pendingPayouts ?? 0)}</p>
               <p className="text-[11px] text-white/70 mt-1">{t("provider_dashboard.pending_admin_approval", "Pending admin approval")}</p>
            </div>

            <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md" data-testid="card-lifetime-paid">
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-xl" />
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/80">{t("provider_dashboard.lifetime_paid_out", "Lifetime paid out")}</p>
                <TrendingUp className="h-4 w-4 text-white/70" />
              </div>
              <p className="text-3xl font-bold mt-2" data-testid="text-lifetime-paid">{fmt(summary?.lifetimePaidOut ?? 0)}</p>
               <p className="text-[11px] text-white/70 mt-1">{t("provider_dashboard.all_time_withdrawals", "All-time withdrawals")}</p>
            </div>
          </>
        )}
      </div>

      {!summaryLoading && summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("provider_dashboard.settlement_details", "Settlement details")}</CardTitle>
             <CardDescription>{t("provider_dashboard.settlement_details_desc", "Provider-side settlement deductions are applied automatically when applicable.")}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{t("provider_dashboard.gross_available", "Gross available")}</p><p className="font-semibold mt-1">{fmt(summary.grossAvailableBalance ?? 0)}</p></div>
             <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{t("provider_dashboard.pending_settlement_deduction", "Pending settlement deduction")}</p><p className="font-semibold mt-1 text-amber-700">−{fmt(summary.pendingSettlementDeduction ?? 0)}</p></div>
            {(summary.outstandingWalletDebt ?? 0) > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/20">
                 <p className="text-xs text-red-700 dark:text-red-300">{t("provider_dashboard.outstanding_platform_balance", "Outstanding platform balance")}</p>
                <p className="font-semibold mt-1 text-red-700 dark:text-red-300">{fmt(summary.outstandingWalletDebt)}</p>
              </div>
            )}
             <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{t("provider_dashboard.cash_bookings", "Cash bookings")}</p><p className="font-semibold mt-1">{summary.cashBookingCount ?? 0}</p></div>
          </CardContent>
        </Card>
      )}

      {/* Request Withdrawal Button */}
      <Card data-testid="card-request-payout">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
                {t("provider_dashboard.request_withdrawal", "Request Withdrawal")}
              </CardTitle>
              <CardDescription className="mt-1">
                 {t("provider_dashboard.withdrawal_desc", "Withdraw your available earnings. Processed within 2–3 business days.")}
              </CardDescription>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              disabled={available <= 0 || hasOpenRequest || summaryLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-request-payout"
            >
              <ArrowDownToLine className="h-4 w-4 mr-2" />
               {t("provider_dashboard.request_withdrawal", "Request Withdrawal")}
            </Button>
          </div>
          {hasOpenRequest && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
               {t("provider_dashboard.open_payout_request", "You already have an open payout request being processed.")}
            </div>
          )}
          {available <= 0 && !hasOpenRequest && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
               {t("provider_dashboard.no_available_balance", "No available balance to withdraw yet.")}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Payout History */}
      <Card data-testid="card-payout-history">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
             {t("provider_dashboard.payout_history", "Payout History")}
          </CardTitle>
           <CardDescription>{t("provider_dashboard.payout_history_desc", "All your withdrawal requests and their status.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {requestsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : !requests?.length ? (
            <div className="text-center py-10 text-muted-foreground">
              <Banknote className="h-10 w-10 mx-auto mb-3 opacity-30" />
               <p className="text-sm">{t("provider_dashboard.no_payout_requests", "No payout requests yet.")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/30 transition-colors" data-testid={`row-payout-${r.id}`}>
                  <div className="mt-0.5">{statusIcon(r.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{fmt(Number(r.amount))}</span>
                       {statusBadge(r.status, t)}
                      <span className="text-xs text-muted-foreground capitalize">{r.method?.replace("_", " ")}</span>
                    </div>
                    {r.bank_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">{r.bank_name}{r.account_holder ? ` · ${r.account_holder}` : ""}</p>
                    )}
                    {r.admin_note && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1 border border-amber-100">{r.admin_note}</p>
                    )}
                    {r.payment_reference && (
                       <p className="text-xs text-emerald-700 mt-1">{t("provider_dashboard.ref", "Ref:")} {r.payment_reference}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                       {t("provider_dashboard.requested", "Requested")} {formatDate(r.created_at)}
                       {r.paid_at ? ` · ${t("provider_dashboard.paid", "Paid")} ${formatDate(r.paid_at)}` : r.reviewed_at ? ` · ${t("provider_dashboard.reviewed", "Reviewed")} ${formatDate(r.reviewed_at)}` : ""}
                    </p>
                  </div>
                  {r.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0 h-8 px-2 text-xs"
                      onClick={() => cancelMutation.mutate(r.id)}
                      disabled={cancelMutation.isPending}
                      data-testid={`btn-cancel-payout-${r.id}`}
                    >
                       {cancelMutation.isPending ? "…" : t("common.cancel", "Cancel")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Withdrawal Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
           <DialogTitle>{t("provider_dashboard.request_withdrawal", "Request Withdrawal")}</DialogTitle>
            <DialogDescription>
               {t("provider_dashboard.available_balance_enter", "Available balance:")} <strong>{fmt(available)}</strong>. {t("provider_dashboard.enter_payment_details", "Enter the amount and payment details below.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
               <Label htmlFor="payout-amount">{t("provider_dashboard.amount_required", "Amount *")}</Label>
              <Input
                id="payout-amount"
                type="number"
                min="1"
                max={convert(available)}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Max ${formatCount(Math.floor(convert(available)))}`}
                data-testid="input-payout-amount"
              />
               <p className="text-xs text-muted-foreground">{t("provider_dashboard.available", "Available:")} {fmt(available)}</p>
            </div>
            <div className="space-y-1.5">
               <Label>{t("provider_dashboard.payment_method_required", "Payment Method *")}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger data-testid="select-payout-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                   <SelectItem value="bank_transfer">{t("provider_dashboard.bank_transfer", "Bank Transfer")}</SelectItem>
                   <SelectItem value="manual">{t("provider_dashboard.manual_cash", "Manual / Cash")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {method === "bank_transfer" && (
              <>
                <div className="space-y-1.5">
                   <Label htmlFor="payout-bank">{t("provider_dashboard.bank_name", "Bank Name")}</Label>
                  <Input id="payout-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder={t("provider_dashboard.payout_bank_placeholder", "e.g. OTP Bank")} data-testid="input-payout-bank" />
                </div>
                <div className="space-y-1.5">
                   <Label htmlFor="payout-holder">{t("provider_dashboard.account_holder_name", "Account Holder Name")}</Label>
                  <Input id="payout-holder" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder={t("provider_dashboard.payout_holder_placeholder", "Full name on account")} data-testid="input-payout-holder" />
                </div>
                <div className="space-y-1.5">
                   <Label htmlFor="payout-acct">{t("provider_dashboard.account_number_last4", "Account Number (last 4 digits)")}</Label>
                  <Input id="payout-acct" value={accountNumberMasked} onChange={(e) => setAccountNumberMasked(e.target.value)} placeholder={t("provider_dashboard.payout_account_placeholder", "e.g. ****1234")} maxLength={10} data-testid="input-payout-account" />
                </div>
              </>
            )}
            <div className="space-y-1.5">
               <Label htmlFor="payout-notes">{t("provider_dashboard.notes_optional", "Notes (optional)")}</Label>
              <Textarea id="payout-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("provider_dashboard.payout_notes_placeholder", "Any additional instructions for admin...")} rows={2} data-testid="input-payout-notes" />
            </div>
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={createMutation.isPending}>{t("common.cancel", "Cancel")}</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || !amount} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-submit-payout">
               {createMutation.isPending ? t("provider_dashboard.submitting", "Submitting…") : t("provider_dashboard.submit_request", "Submit Request")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
