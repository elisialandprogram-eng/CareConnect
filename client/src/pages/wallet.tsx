import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Wallet as WalletIcon, ArrowDownCircle, ArrowUpCircle, RefreshCw, Sparkles, ShieldCheck, Gift } from "lucide-react";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Link } from "wouter";
import { WalletTopUpModal } from "@/components/patient/WalletTopUpModal";
import type { Wallet, WalletTransaction } from "@shared/schema";
import { useCurrency, formatInCurrency } from "@/lib/currency";
import { QK } from "@/lib/query-keys";

const LOCAL_PRESETS_BY_CURRENCY: Record<string, number[]> = {
  HUF: [2000, 5000, 10000, 25000],
  IRR: [500_000, 1_000_000, 2_500_000, 5_000_000],
  USD: [5, 10, 25, 50],
  GBP: [5, 10, 25, 50],
  EUR: [5, 10, 25, 50],
};

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
  usePageTitle(t("wallet.meta_title", "My Wallet"));
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const { format: fmtMoney, code } = useCurrency();
  const quickAmounts = LOCAL_PRESETS_BY_CURRENCY[code] ?? [5, 10, 25, 50];

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
          queryClient.invalidateQueries({ queryKey: QK.wallet() });
          queryClient.invalidateQueries({ queryKey: QK.walletTransactions() });
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
    queryKey: QK.wallet(),
    enabled: isAuthenticated,
  });

  const { data: transactions, isLoading: txLoading } = useQuery<WalletTransaction[]>({
    queryKey: QK.walletTransactions(),
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

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-8" data-testid="page-wallet">
        <div className="container mx-auto px-4 max-w-5xl space-y-6">
          <PageBreadcrumbs
            items={[{ label: "Home", href: "/" }, { label: t("wallet.title", "My Wallet") }]}
            fallback="/"
          />
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
                    fmtMoney(wallet?.balance ?? 0)
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
            <Card className="flex flex-col">
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
              <CardContent className="flex-1 flex flex-col justify-between space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {quickAmounts.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setTopUpOpen(true)}
                      data-testid={`button-amount-${n}`}
                      className="rounded-xl border border-border py-3 text-sm font-semibold hover:border-primary/60 hover:bg-primary/5 transition-all text-center"
                    >
                      {formatInCurrency(n, code)}
                    </button>
                  ))}
                </div>
                <Button
                  className="w-full gap-2"
                  size="lg"
                  onClick={() => setTopUpOpen(true)}
                  disabled={topupMutation.isPending}
                  data-testid="button-wallet-topup"
                >
                  <Sparkles className="h-4 w-4" />
                  {t("wallet.topup_cta", "Top up wallet")}
                </Button>
              </CardContent>
            </Card>
            <WalletTopUpModal
              open={topUpOpen}
              onOpenChange={setTopUpOpen}
              onTopUp={(amountUSD) => topupMutation.mutate(amountUSD)}
              isPending={topupMutation.isPending}
            />
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
                  queryClient.invalidateQueries({ queryKey: QK.wallet() });
                  queryClient.invalidateQueries({ queryKey: QK.walletTransactions() });
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
                <div className="flex flex-col items-center py-12 text-center" data-testid="text-no-transactions">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Sparkles className="h-7 w-7 text-muted-foreground opacity-50" />
                  </div>
                  <h3 className="font-semibold text-base mb-1">
                    {t("wallet.no_transactions_title", "No transactions yet")}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-5 max-w-xs">
                    {t("wallet.no_transactions_desc", "Top up your wallet to unlock fast, seamless payments for your appointments.")}
                  </p>
                  <Button size="sm" onClick={() => { document.getElementById("wallet-amount")?.focus(); }}>
                    {t("wallet.topup_cta", "Top up wallet")}
                  </Button>
                </div>
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
                            {fmtMoney(amt)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {t("wallet.balance_after", "Balance")}{" "}
                            {fmtMoney(tx.balanceAfter)}
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
