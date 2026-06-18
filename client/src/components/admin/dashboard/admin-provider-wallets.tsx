import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search, RefreshCw, Wallet, Lock, Unlock, Info,
  History, TrendingUp, TrendingDown, ArrowRight, ChevronLeft, ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { fmtBalance } from "./utils";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AdminWallet {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_email: string;
  provider_type: string;
  available_balance: string;
  held_balance: string;
  lifetime_earnings: string;
  currency: string;
  is_frozen: boolean;
  frozen_reason: string | null;
  last_payout_date: string | null;
  country_code: string;
}

interface LedgerEntry {
  id: string;
  entryType: string;
  amount: string;
  description: string | null;
  referenceId: string | null;
  balanceAfter: string | null;
  currency: string;
  createdAt: string;
  actorName: string | null;
  actorRole: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function entryTypeLabel(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function entryTypeColor(t: string): string {
  const credits = ["booking_income", "admin_credit", "wallet_adjustment", "payout_returned", "manual_correction"];
  const debits  = ["refund_deduction", "platform_fee_deduction", "commission_deduction",
                   "tax_deduction", "payout_held", "payout_deduction", "admin_debit", "membership_charge", "package_charge"];
  if (credits.some(k => t.includes(k))) return "credit";
  if (debits.some(k => t.includes(k)))  return "debit";
  return "neutral";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ── Ledger history sheet ──────────────────────────────────────────────────────
function LedgerHistorySheet({
  wallet,
  open,
  onClose,
}: {
  wallet: AdminWallet | null;
  open: boolean;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { data, isLoading } = useQuery<{
    entries: LedgerEntry[];
    total: number;
  }>({
    queryKey: ["/api/admin/provider-wallets", wallet?.provider_id, "ledger", page],
    queryFn: () =>
      fetch(
        `/api/admin/provider-wallets/${wallet!.provider_id}/ledger?limit=${pageSize}&offset=${page * pageSize}`,
        { credentials: "include" },
      ).then(r => r.json()),
    enabled: !!wallet && open,
  });

  const entries = data?.entries ?? [];
  const total   = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const creditTotal = entries
    .filter(e => entryTypeColor(e.entryType) === "credit")
    .reduce((s, e) => s + parseFloat(e.amount || "0"), 0);
  const debitTotal = entries
    .filter(e => entryTypeColor(e.entryType) === "debit")
    .reduce((s, e) => s + parseFloat(e.amount || "0"), 0);

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) { onClose(); setPage(0); } }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            Ledger History
          </SheetTitle>
          <SheetDescription>
            {wallet?.provider_name} · {wallet?.provider_email}
          </SheetDescription>

          {/* Balance summary strip */}
          {wallet && (
            <div className="flex gap-3 pt-2">
              <div className="flex-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 px-3 py-2">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Available</p>
                <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                  {fmtBalance(wallet.available_balance, wallet.currency)}
                </p>
              </div>
              <div className="flex-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 px-3 py-2">
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Held</p>
                <p className="text-base font-bold text-amber-700 dark:text-amber-300">
                  {fmtBalance(wallet.held_balance, wallet.currency)}
                </p>
              </div>
              <div className="flex-1 rounded-lg bg-muted/50 border border-border/60 px-3 py-2">
                <p className="text-xs text-muted-foreground font-medium">Lifetime</p>
                <p className="text-base font-bold text-foreground">
                  {fmtBalance(wallet.lifetime_earnings, wallet.currency)}
                </p>
              </div>
            </div>
          )}
        </SheetHeader>

        {/* Page stats */}
        {!isLoading && entries.length > 0 && (
          <div className="flex items-center gap-4 px-6 py-2.5 bg-muted/30 border-b text-xs text-muted-foreground">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <TrendingUp className="h-3 w-3" />
              Credits: {fmtBalance(String(creditTotal), "USD")}
            </span>
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
              <TrendingDown className="h-3 w-3" />
              Debits: {fmtBalance(String(debitTotal), "USD")}
            </span>
            <span className="ml-auto">{total} total entries</span>
          </div>
        )}

        {/* Entries list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <History className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No ledger entries yet</p>
            </div>
          ) : (
            entries.map(entry => {
              const kind = entryTypeColor(entry.entryType);
              return (
                <div
                  key={entry.id}
                  data-testid={`ledger-entry-${entry.id}`}
                  className={cn(
                    "flex items-start gap-3 p-3.5 rounded-xl border transition-colors",
                    kind === "credit"
                      ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40"
                      : kind === "debit"
                      ? "bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-900/40"
                      : "bg-muted/30 border-border/50"
                  )}
                >
                  {/* Direction indicator */}
                  <div className={cn(
                    "p-1.5 rounded-lg shrink-0 mt-0.5",
                    kind === "credit"
                      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
                      : kind === "debit"
                      ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {kind === "credit"
                      ? <TrendingUp className="h-3.5 w-3.5" />
                      : kind === "debit"
                      ? <TrendingDown className="h-3.5 w-3.5" />
                      : <ArrowRight className="h-3.5 w-3.5" />
                    }
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-foreground">
                          {entryTypeLabel(entry.entryType)}
                        </span>
                        {entry.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                            {entry.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {entry.actorName && (
                            <span className="text-[11px] text-muted-foreground">
                              by <span className="font-medium">{entry.actorName}</span>
                              {entry.actorRole && (
                                <span className="capitalize"> ({entry.actorRole.replace(/_/g, " ")})</span>
                              )}
                            </span>
                          )}
                          {entry.referenceId && (
                            <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[100px]">
                              ref: {entry.referenceId.slice(0, 8)}…
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground ml-auto">
                            {timeAgo(entry.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Amount + balance after */}
                      <div className="text-right shrink-0">
                        <p className={cn(
                          "text-sm font-bold tabular-nums",
                          kind === "credit"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : kind === "debit"
                            ? "text-red-600 dark:text-red-400"
                            : "text-foreground"
                        )}>
                          {kind === "credit" ? "+" : kind === "debit" ? "−" : ""}
                          {fmtBalance(entry.amount, entry.currency)}
                        </p>
                        {entry.balanceAfter != null && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            bal: {fmtBalance(entry.balanceAfter, entry.currency)}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/20">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              data-testid="btn-ledger-prev"
              className="gap-1 h-7 text-xs"
            >
              <ChevronLeft className="h-3 w-3" /> Prev
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} · {total} entries
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              data-testid="btn-ledger-next"
              className="gap-1 h-7 text-xs"
            >
              Next <ChevronRightIcon className="h-3 w-3" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function AdminProviderWalletsPanel() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const [selectedWallet, setSelectedWallet]   = useState<AdminWallet | null>(null);
  const [adjustOpen, setAdjustOpen]           = useState(false);
  const [adjustAmount, setAdjustAmount]       = useState("");
  const [adjustDesc, setAdjustDesc]           = useState("");
  const [adjustType, setAdjustType]           = useState("manual_correction");

  const [freezeOpen, setFreezeOpen]           = useState(false);
  const [freezeTarget, setFreezeTarget]       = useState<AdminWallet | null>(null);
  const [freezeReason, setFreezeReason]       = useState("");

  const [historyWallet, setHistoryWallet]     = useState<AdminWallet | null>(null);
  const [historyOpen, setHistoryOpen]         = useState(false);

  const { data, isLoading, refetch } = useQuery<{
    wallets: AdminWallet[];
    total: number;
  }>({
    queryKey: ["/api/admin/provider-wallets", search],
    queryFn: () =>
      fetch(
        `/api/admin/provider-wallets?search=${encodeURIComponent(search)}&limit=50`,
        { credentials: "include" },
      ).then(r => r.json()),
  });

  const wallets = data?.wallets ?? [];

  const adjustMutation = useMutation({
    mutationFn: ({
      providerId,
      amount,
      description,
      entryType,
    }: {
      providerId: string;
      amount: number;
      description: string;
      entryType: string;
    }) =>
      apiRequest("POST", `/api/admin/provider-wallets/${providerId}/adjust`, {
        amount,
        description,
        entryType,
      }),
    onSuccess: () => {
      toast({
        title: "Wallet adjusted",
        description: "The provider's balance has been updated.",
      });
      refetch();
      setAdjustOpen(false);
      setAdjustAmount("");
      setAdjustDesc("");
    },
    onError: (e: any) =>
      toast({
        title: "Failed to adjust",
        description: e.message,
        variant: "destructive",
      }),
  });

  const freezeMutation = useMutation({
    mutationFn: ({
      providerId,
      frozen,
      reason,
    }: {
      providerId: string;
      frozen: boolean;
      reason?: string;
    }) =>
      apiRequest("PATCH", `/api/admin/provider-wallets/${providerId}/freeze`, {
        frozen,
        reason,
      }),
    onSuccess: (_data, vars) => {
      toast({ title: vars.frozen ? "Wallet frozen" : "Wallet unfrozen" });
      refetch();
      setFreezeOpen(false);
      setFreezeTarget(null);
      setFreezeReason("");
    },
    onError: (e: any) =>
      toast({
        title: "Failed to update freeze status",
        description: e.message,
        variant: "destructive",
      }),
  });

  const openFreezeDialog = (w: AdminWallet) => {
    setFreezeTarget(w);
    setFreezeReason("");
    setFreezeOpen(true);
  };

  const openHistory = (w: AdminWallet) => {
    setHistoryWallet(w);
    setHistoryOpen(true);
  };

  const handleFreezeConfirm = () => {
    if (!freezeTarget) return;
    if (!freezeTarget.is_frozen && !freezeReason.trim()) {
      toast({ title: "Please enter a reason for freezing", variant: "destructive" });
      return;
    }
    freezeMutation.mutate({
      providerId: freezeTarget.provider_id,
      frozen: !freezeTarget.is_frozen,
      reason: !freezeTarget.is_frozen ? freezeReason.trim() : undefined,
    });
  };

  return (
    <div className="space-y-6" data-testid="admin-provider-wallets-panel">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Provider Wallets
              </CardTitle>
              <CardDescription>
                View balances, freeze wallets, make adjustments, and browse transaction history
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 w-64"
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-wallet-search"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                data-testid="btn-wallet-refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : wallets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No provider wallets found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Provider</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Available</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Held</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Lifetime</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((w) => (
                    <tr
                      key={w.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                      data-testid={`row-wallet-${w.provider_id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{w.provider_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {w.provider_email} · {w.provider_type}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {fmtBalance(w.available_balance, w.currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-600">
                        {fmtBalance(w.held_balance, w.currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {fmtBalance(w.lifetime_earnings, w.currency)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {w.is_frozen ? (
                            <Badge className="bg-red-100 text-red-800 border-red-200 border text-xs">
                              Frozen
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 border text-xs">
                              Active
                            </Badge>
                          )}
                          {w.is_frozen && w.frozen_reason && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors max-w-[120px] truncate"
                                    data-testid={`btn-freeze-reason-${w.provider_id}`}
                                  >
                                    <Info className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{w.frozen_reason}</span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                  {w.frozen_reason}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => openHistory(w)}
                            data-testid={`btn-ledger-history-${w.provider_id}`}
                          >
                            <History className="h-3 w-3" />
                            History
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setSelectedWallet(w);
                              setAdjustOpen(true);
                              setAdjustAmount("");
                              setAdjustDesc("");
                            }}
                            data-testid={`btn-adjust-wallet-${w.provider_id}`}
                          >
                            Adjust
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 px-2 text-xs flex items-center gap-1 ${
                              w.is_frozen
                                ? "text-emerald-600 hover:text-emerald-700"
                                : "text-red-600 hover:text-red-700"
                            }`}
                            onClick={() => openFreezeDialog(w)}
                            disabled={freezeMutation.isPending}
                            data-testid={`btn-freeze-wallet-${w.provider_id}`}
                          >
                            {w.is_frozen ? (
                              <><Unlock className="h-3 w-3" /> Unfreeze</>
                            ) : (
                              <><Lock className="h-3 w-3" /> Freeze</>
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Ledger history drawer ── */}
      <LedgerHistorySheet
        wallet={historyWallet}
        open={historyOpen}
        onClose={() => { setHistoryOpen(false); setHistoryWallet(null); }}
      />

      {/* ── Manual balance adjustment dialog ── */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Wallet Balance</DialogTitle>
            <DialogDescription>
              {selectedWallet && (
                <>
                  Adjusting wallet for{" "}
                  <strong>{selectedWallet.provider_name}</strong>. Current
                  available:{" "}
                  <strong>
                    {fmtBalance(selectedWallet.available_balance, selectedWallet.currency)}
                  </strong>
                  .
                </>
              )}{" "}
              Use positive amount to credit, negative to debit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Amount (positive = credit, negative = debit)</Label>
              <Input
                type="number"
                step="1"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="e.g. 10 or -10"
                data-testid="input-adjust-amount"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Entry type</Label>
              <select
                className="w-full border rounded-md h-9 px-3 text-sm bg-background"
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value)}
                data-testid="select-adjust-type"
              >
                <option value="manual_correction">Manual correction</option>
                <option value="wallet_adjustment">Wallet adjustment</option>
                <option value="refund_deduction">Refund deduction</option>
                <option value="commission_deduction">Commission deduction</option>
                <option value="tax_deduction">Tax deduction</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason / Description *</Label>
              <Input
                value={adjustDesc}
                onChange={(e) => setAdjustDesc(e.target.value)}
                placeholder="Explain why this adjustment is being made"
                data-testid="input-adjust-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedWallet || !adjustAmount || !adjustDesc.trim()) {
                  toast({ title: "Fill all fields", variant: "destructive" });
                  return;
                }
                adjustMutation.mutate({
                  providerId: selectedWallet.provider_id,
                  amount: Number(adjustAmount),
                  description: adjustDesc,
                  entryType: adjustType,
                });
              }}
              disabled={adjustMutation.isPending}
              data-testid="btn-confirm-adjust"
            >
              {adjustMutation.isPending ? "Saving…" : "Apply adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Freeze / unfreeze confirmation dialog ── */}
      <Dialog
        open={freezeOpen}
        onOpenChange={(o) => {
          if (!o) { setFreezeOpen(false); setFreezeTarget(null); setFreezeReason(""); }
        }}
      >
        <DialogContent className="max-w-md" data-testid="dialog-freeze-wallet">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {freezeTarget?.is_frozen ? (
                <><Unlock className="h-5 w-5 text-emerald-600" /> Unfreeze wallet</>
              ) : (
                <><Lock className="h-5 w-5 text-red-600" /> Freeze wallet</>
              )}
            </DialogTitle>
            <DialogDescription>
              {freezeTarget?.is_frozen ? (
                <>
                  This will restore full payout capability for{" "}
                  <strong>{freezeTarget?.provider_name}</strong> and clear any audit hold.
                </>
              ) : (
                <>
                  This will block all payouts for{" "}
                  <strong>{freezeTarget?.provider_name}</strong> until manually unfrozen.
                  Please provide a clear reason.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {freezeTarget?.is_frozen && freezeTarget.frozen_reason && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium text-xs uppercase tracking-wide mb-1">Current freeze reason</p>
              <p>{freezeTarget.frozen_reason}</p>
            </div>
          )}

          {!freezeTarget?.is_frozen && (
            <div className="space-y-1.5">
              <Label htmlFor="freeze-reason">
                Reason for freezing <span className="text-red-500">*</span>
              </Label>
              <Input
                id="freeze-reason"
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                placeholder="e.g. Suspicious payout request flagged for review"
                data-testid="input-freeze-reason"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setFreezeOpen(false); setFreezeTarget(null); setFreezeReason(""); }}
              data-testid="btn-cancel-freeze"
            >
              Cancel
            </Button>
            <Button
              variant={freezeTarget?.is_frozen ? "default" : "destructive"}
              onClick={handleFreezeConfirm}
              disabled={freezeMutation.isPending}
              data-testid="btn-confirm-freeze"
            >
              {freezeMutation.isPending
                ? "Saving…"
                : freezeTarget?.is_frozen
                ? "Confirm unfreeze"
                : "Confirm freeze"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
