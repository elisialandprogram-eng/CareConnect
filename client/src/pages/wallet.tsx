import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Wallet as WalletIcon, ArrowDownCircle, ArrowUpCircle, RefreshCw, Sparkles, ShieldCheck, Gift } from "lucide-react";
import { Link } from "wouter";
import type { Wallet, WalletTransaction } from "@shared/schema";
import { useCurrency } from "@/lib/currency";

const QUICK_AMOUNTS = [5000, 10000, 25000, 50000];

function txIcon(type: string) {
  switch (type) {
    case "topup":
    case "refund":
    case "adjustment":
      return <ArrowDownCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
    case "debit":
    case "reversal":
    default:
      return <ArrowUpCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
  }
}

export default function WalletPage() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("10000");
  const { format: formatHUF } = useCurrency();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login?redirect=/wallet");
  }, [authLoading, isAuthenticated, navigate]);

  // Pick up Stripe success / cancel from URL after returning from checkout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("topup");
    if (status === "success") {
      toast({
        title: t("wallet.topup_success_title", "Top-up received"),
        description: t("wallet.topup_success_desc", "Your wallet balance will update shortly."),
      });
      // Webhook may take a moment — refetch a few times.
      const tries = [800, 2500, 5000];
      tries.forEach((ms) =>
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
          queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
        }, ms),
      );
      window.history.replaceState({}, "", "/wallet");
    } else if (status === "cancelled") {
      showErrorModal({
        title: t("wallet.topup_cancelled_title", "Top-up cancelled"),
        description: t("wallet.topup_cancelled_desc", "No charge was made."),
        context: "wallet.topupCancelled",
      });
      window.history.replaceState({}, "", "/wallet");
    }
  }, [toast, t]);

  const { data: wallet, isLoading: walletLoading } = useQuery<Wallet>({
    queryKey: ["/api/wallet"],
    enabled: isAuthenticated,
  });

  const { data: transactions, isLoading: txLoading } = useQuery<WalletTransaction[]>({
    queryKey: ["/api/wallet/transactions"],
    enabled: isAuthenticated,
  });

  const topupMutation = useMutation({
    mutationFn: async (n: number) => {
      const res = await apiRequest("POST", "/api/wallet/topup", { amount: n });
      return res.json();
    },
    onSuccess: (data: { url?: string }) => {
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: t("wallet.topup_started", "Top-up started"),
          description: t("wallet.topup_pending", "Waiting for payment confirmation."),
        });
      }
    },
    onError: (err: Error) => {
      showErrorModal({
        title: t("wallet.topup_failed", "Top-up failed"),
        description: err.message,
        context: "wallet.topup",
      });
    },
  });

  const handleTopUp = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      showErrorModal({
        title: t("wallet.invalid_amount", "Invalid amount"),
        description: t("wallet.invalid_amount_desc", "Enter a positive amount."),
        context: "wallet.invalidAmount",
      });
      return;
    }
    topupMutation.mutate(Math.round(n));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-8" data-testid="page-wallet">
        <div className="container mx-auto px-4 max-w-5xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <WalletIcon className="h-7 w-7 text-primary" />
                {t("wallet.title", "My Wallet")}
              </h1>
              <p className="text-muted-foreground">
                {t("wallet.subtitle", "Pre-load credits and pay for any service in one tap.")}
              </p>
            </div>
            <Link href="/referrals">
              <Button variant="outline" className="gap-2" data-testid="link-wallet-referrals">
                <Gift className="h-4 w-4 text-primary" />
                {t("wallet.refer_friend", "Refer a friend, earn credit")}
              </Button>
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Balance card */}
            <Card className="bg-gradient-to-br from-primary/10 via-background to-background">
              <CardHeader className="pb-2">
                <CardDescription>{t("wallet.balance_label", "Available balance")}</CardDescription>
                <CardTitle className="text-4xl font-bold tracking-tight" data-testid="text-wallet-balance">
                  {walletLoading ? (
                    <Skeleton className="h-10 w-40" />
                  ) : (
                    formatHUF(wallet?.balance ?? 0)
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  {t(
                    "wallet.security_note",
                    "All movements are recorded in a tamper-proof ledger.",
                  )}
                </div>
                {wallet?.isFrozen && (
                  <Badge variant="destructive" data-testid="badge-wallet-frozen">
                    {t("wallet.frozen", "Wallet temporarily frozen")}
                  </Badge>
                )}
              </CardContent>
            </Card>

            {/* Top-up card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {t("wallet.topup_title", "Add credit")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "wallet.topup_desc",
                    "Top up securely with your card. Funds are available immediately after payment.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {QUICK_AMOUNTS.map((n) => (
                    <Button
                      key={n}
                      type="button"
                      variant={Number(amount) === n ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAmount(String(n))}
                      data-testid={`button-amount-${n}`}
                    >
                      {formatHUF(n)}
                    </Button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wallet-amount">
                    {t("wallet.custom_amount", "Custom amount")}
                  </Label>
                  <Input
                    id="wallet-amount"
                    type="number"
                    min={500}
                    step={500}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    data-testid="input-wallet-amount"
                  />
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleTopUp}
                  disabled={topupMutation.isPending}
                  data-testid="button-wallet-topup"
                >
                  {topupMutation.isPending
                    ? t("wallet.processing", "Processing…")
                    : t("wallet.topup_cta", "Top up wallet")}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Transactions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t("wallet.history_title", "Transaction history")}</CardTitle>
                <CardDescription>
                  {t("wallet.history_desc", "Every credit and debit on your wallet.")}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
                }}
                data-testid="button-wallet-refresh"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                {t("wallet.refresh", "Refresh")}
              </Button>
            </CardHeader>
            <CardContent>
              {txLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !transactions?.length ? (
                <p className="text-muted-foreground text-center py-8" data-testid="text-no-transactions">
                  {t("wallet.no_transactions", "No transactions yet. Top up to get started.")}
                </p>
              ) : (
                <ul className="divide-y">
                  {transactions.map((tx) => {
                    const amt = Number(tx.amount);
                    const positive = amt >= 0;
                    return (
                      <li
                        key={tx.id}
                        className="flex items-center gap-3 py-3"
                        data-testid={`row-transaction-${tx.id}`}
                      >
                        <div className="rounded-full bg-muted p-2">{txIcon(tx.type)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">
                            {t(`wallet.tx_type.${tx.type}`, tx.type)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {tx.description ||
                              t("wallet.no_description", "No description")}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {tx.createdAt
                              ? new Date(tx.createdAt).toLocaleString()
                              : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-semibold ${
                              positive
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {positive ? "+" : ""}
                            {formatHUF(amt)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {t("wallet.balance_after", "Balance")}{" "}
                            {formatHUF(tx.balanceAfter)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
