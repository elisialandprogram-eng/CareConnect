import { formatDate } from "@/lib/datetime";
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

interface PayoutSummary {
  availableBalance: number;
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

function statusBadge(status: string) {
  switch (status) {
    case "pending":  return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending review</Badge>;
    case "approved": return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Approved</Badge>;
    case "paid":     return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Paid</Badge>;
    case "rejected": return <Badge className="bg-red-100 text-red-800 border-red-200">Rejected</Badge>;
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
      toast({ title: "Payout request submitted", description: "Admin will review your request shortly." });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/payout-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/payout-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/wallet/ledger"] });
      setDialogOpen(false);
      setAmount(""); setBankName(""); setAccountHolder(""); setAccountNumberMasked(""); setNotes("");
    },
    onError: (e: any) => toast({ title: "Failed to submit", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/provider/payout-requests/${id}`),
    onSuccess: () => {
      toast({ title: "Payout request cancelled", description: "Your funds have been returned to your available balance." });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/payout-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/payout-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/wallet/ledger"] });
    },
    onError: (e: any) => toast({ title: "Failed to cancel", description: e.message, variant: "destructive" }),
  });

  const hasOpenRequest = requests?.some(r => r.status === "pending" || r.status === "approved");
  const available = summary?.availableBalance ?? 0;

  function handleSubmit() {
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    const availableLocal = convert(available);
    if (n > availableLocal + 0.5) { toast({ title: "Amount exceeds available balance", variant: "destructive" }); return; }
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
                <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Available to withdraw</p>
                <Wallet className="h-4 w-4 text-white/70" />
              </div>
              <p className="text-3xl font-bold mt-2" data-testid="text-available-balance">{fmt(available)}</p>
              <p className="text-[11px] text-white/70 mt-1">Ready for payout request</p>
            </div>

            <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md" data-testid="card-pending-payout">
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-xl" />
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/80">In-flight payouts</p>
                <Clock className="h-4 w-4 text-white/70" />
              </div>
              <p className="text-3xl font-bold mt-2" data-testid="text-pending-payout">{fmt(summary?.pendingPayouts ?? 0)}</p>
              <p className="text-[11px] text-white/70 mt-1">Pending admin approval</p>
            </div>

            <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md" data-testid="card-lifetime-paid">
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-xl" />
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Lifetime paid out</p>
                <TrendingUp className="h-4 w-4 text-white/70" />
              </div>
              <p className="text-3xl font-bold mt-2" data-testid="text-lifetime-paid">{fmt(summary?.lifetimePaidOut ?? 0)}</p>
              <p className="text-[11px] text-white/70 mt-1">All-time withdrawals</p>
            </div>
          </>
        )}
      </div>

      {/* Request Withdrawal Button */}
      <Card data-testid="card-request-payout">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
                Request Withdrawal
              </CardTitle>
              <CardDescription className="mt-1">
                Withdraw your available earnings. Processed within 2–3 business days.
              </CardDescription>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              disabled={available <= 0 || hasOpenRequest || summaryLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-request-payout"
            >
              <ArrowDownToLine className="h-4 w-4 mr-2" />
              Request Withdrawal
            </Button>
          </div>
          {hasOpenRequest && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              You already have an open payout request being processed.
            </div>
          )}
          {available <= 0 && !hasOpenRequest && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              No available balance to withdraw yet.
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Payout History */}
      <Card data-testid="card-payout-history">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            Payout History
          </CardTitle>
          <CardDescription>All your withdrawal requests and their status.</CardDescription>
        </CardHeader>
        <CardContent>
          {requestsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : !requests?.length ? (
            <div className="text-center py-10 text-muted-foreground">
              <Banknote className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No payout requests yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/30 transition-colors" data-testid={`row-payout-${r.id}`}>
                  <div className="mt-0.5">{statusIcon(r.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{fmt(Number(r.amount))}</span>
                      {statusBadge(r.status)}
                      <span className="text-xs text-muted-foreground capitalize">{r.method?.replace("_", " ")}</span>
                    </div>
                    {r.bank_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">{r.bank_name}{r.account_holder ? ` · ${r.account_holder}` : ""}</p>
                    )}
                    {r.admin_note && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1 border border-amber-100">{r.admin_note}</p>
                    )}
                    {r.payment_reference && (
                      <p className="text-xs text-emerald-700 mt-1">Ref: {r.payment_reference}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Requested {formatDate(r.created_at)}
                      {r.paid_at ? ` · Paid ${formatDate(r.paid_at)}` : r.reviewed_at ? ` · Reviewed ${formatDate(r.reviewed_at)}` : ""}
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
                      {cancelMutation.isPending ? "…" : "Cancel"}
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
            <DialogTitle>Request Withdrawal</DialogTitle>
            <DialogDescription>
              Available balance: <strong>{fmt(available)}</strong>. Enter the amount and payment details below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="payout-amount">Amount *</Label>
              <Input
                id="payout-amount"
                type="number"
                min="1"
                max={convert(available)}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Max ${Math.floor(convert(available)).toLocaleString()}`}
                data-testid="input-payout-amount"
              />
              <p className="text-xs text-muted-foreground">Available: {fmt(available)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method *</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger data-testid="select-payout-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="manual">Manual / Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {method === "bank_transfer" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="payout-bank">Bank Name</Label>
                  <Input id="payout-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. OTP Bank" data-testid="input-payout-bank" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payout-holder">Account Holder Name</Label>
                  <Input id="payout-holder" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Full name on account" data-testid="input-payout-holder" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payout-acct">Account Number (last 4 digits)</Label>
                  <Input id="payout-acct" value={accountNumberMasked} onChange={(e) => setAccountNumberMasked(e.target.value)} placeholder="e.g. ****1234" maxLength={10} data-testid="input-payout-account" />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="payout-notes">Notes (optional)</Label>
              <Textarea id="payout-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional instructions for admin..." rows={2} data-testid="input-payout-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={createMutation.isPending}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || !amount} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-submit-payout">
              {createMutation.isPending ? "Submitting…" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
