import { formatDate } from "@/lib/datetime";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CheckCircle, Clock, Star, Zap, Shield, Percent, Gift, ShoppingBag, CalendarClock, Globe, MapPin, Wallet, CreditCard, ChevronLeft, Stethoscope, UserRound, Info } from "lucide-react";
import { QK } from "@/lib/query-keys";
import { useCurrency } from "@/lib/currency";
import type { Wallet as WalletData } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PackageBenefit {
  id: string;
  packageId: string;
  benefitKey: string;
  benefitValue: string;
  notes: string | null;
}

interface PkgData {
  id: string;
  name: string;
  description: string | null;
  countryCode: string | null;
  durationDays: number;
  price: string;
  currency: string;
  targetUserType: string;
  isActive: boolean;
  benefits: PackageBenefit[];
}

interface UserPkgDetail {
  id: string;
  packageId: string;
  status: string;
  pricePaid: string;
  purchasedAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  package: PkgData & { benefits: PackageBenefit[] };
}

// ── Benefit display ────────────────────────────────────────────────────────────

const BENEFIT_DISPLAY: Record<string, { icon: any; label: (v: string) => string; color: string }> = {
  service_discount_percent: {
    icon: Percent,
    label: v => `${v}% off service price on every booking`,
    color: "bg-blue-50 text-blue-700 border-blue-100",
  },
  platform_fee_discount: {
    icon: Percent,
    label: v => `${v}% off platform fee`,
    color: "bg-teal-50 text-teal-700 border-teal-100",
  },
  wallet_bonus: {
    icon: Wallet,
    label: v => `${v} wallet credit on activation`,
    color: "bg-green-50 text-green-700 border-green-100",
  },
  featured_provider: {
    icon: Star,
    label: v => `${v} month(s) featured listing`,
    color: "bg-yellow-50 text-yellow-700 border-yellow-100",
  },
  reduced_commission: {
    icon: Percent,
    label: v => `${v}% commission reduction`,
    color: "bg-purple-50 text-purple-700 border-purple-100",
  },
  priority_support: {
    icon: Shield,
    label: () => "Priority support access",
    color: "bg-red-50 text-red-700 border-red-100",
  },
  free_cancellations: {
    icon: CheckCircle,
    label: v => `${v} free cancellation(s) per month`,
    color: "bg-orange-50 text-orange-700 border-orange-100",
  },
};

function BenefitPill({ benefit }: { benefit: PackageBenefit }) {
  const meta = BENEFIT_DISPLAY[benefit.benefitKey];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${meta.color}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {meta.label(benefit.benefitValue)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:    "bg-green-50 text-green-700 border-green-200",
    pending:   "bg-yellow-50 text-yellow-700 border-yellow-200",
    expired:   "bg-muted/50 text-muted-foreground border-border",
    cancelled: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium capitalize ${map[status] ?? ""}`}>
      {status}
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return formatDate(iso, { year: "numeric", month: "short", day: "numeric" });
}

function daysLeft(expiresAt: string | null) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400_000));
}

// ── Package card ───────────────────────────────────────────────────────────────

function PackageCard({
  pkg,
  onBuy,
  owned,
  walletBalanceUSD,
}: {
  pkg: PkgData;
  onBuy: (pkg: PkgData, method: "card" | "wallet") => void;
  owned: boolean;
  walletBalanceUSD?: number;
}) {
  const { format: fmtMoney } = useCurrency();
  const price = Number(pkg.price);
  const isFree = price === 0;

  // Package prices are stored in USD (canonical storage currency).
  // Wallet balance is also in USD — compare directly.
  const hasKnownBalance = walletBalanceUSD !== undefined;
  const insufficientFunds = hasKnownBalance && walletBalanceUSD < price;

  return (
    <Card className={`relative flex flex-col ${owned ? "ring-2 ring-green-400" : ""}`} data-testid={`card-pkg-${pkg.id}`}>
      {owned && (
        <div className="absolute top-3 right-3">
          <Badge className="bg-green-500 text-white text-xs">Active</Badge>
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{pkg.name}</CardTitle>
            {pkg.description && <CardDescription className="mt-1 text-sm">{pkg.description}</CardDescription>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {pkg.countryCode
            ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{pkg.countryCode}</span>
            : <span className="flex items-center gap-1 text-xs text-muted-foreground"><Globe className="h-3 w-3" />Global</span>
          }
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{pkg.durationDays} days</span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        {/* Benefits */}
        <div className="flex flex-wrap gap-1.5">
          {pkg.benefits.length === 0
            ? <span className="text-xs text-muted-foreground">No specific benefits listed.</span>
            : pkg.benefits.map((b, i) => <BenefitPill key={i} benefit={b} />)
          }
        </div>

        {/* Price & buy */}
        <div className="mt-auto pt-3 border-t space-y-2">
          <p className="text-2xl font-bold tabular-nums">
            {isFree ? <span className="text-green-600">Free</span> : fmtMoney(price)}
          </p>
          {!owned && (
            <div className="flex gap-2 flex-wrap">
              <Button
                className="flex-1"
                onClick={() => onBuy(pkg, "card")}
                data-testid={`button-buy-card-${pkg.id}`}
              >
                <CreditCard className="h-4 w-4 mr-1.5" />
                {isFree ? "Get Free" : "Pay by Card"}
              </Button>
              {!isFree && (
                <div className="flex-1 space-y-1">
                  <Button
                    variant={insufficientFunds ? "ghost" : "outline"}
                    className={`w-full ${insufficientFunds ? "border border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100" : ""}`}
                    onClick={() => onBuy(pkg, "wallet")}
                    disabled={insufficientFunds}
                    data-testid={`button-buy-wallet-${pkg.id}`}
                  >
                    <Wallet className="h-4 w-4 mr-1.5" />
                    {insufficientFunds ? "Insufficient funds" : "Pay from Wallet"}
                  </Button>
                  {hasKnownBalance && (
                    <p className={`text-[11px] text-center ${insufficientFunds ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                      data-testid={`text-wallet-balance-${pkg.id}`}
                    >
                      {insufficientFunds ? "Balance: " : "Wallet: "}
                      <span className="font-semibold">{fmtMoney(walletBalanceUSD!)}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          {owned && (
            <Button variant="outline" className="w-full" disabled>
              <CheckCircle className="h-4 w-4 mr-1.5 text-green-500" />
              You have this package
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── My package card ────────────────────────────────────────────────────────────

function MyPackageCard({ up }: { up: UserPkgDetail }) {
  const days = daysLeft(up.expiresAt);
  const isExpiringSoon = days !== null && days <= 7 && up.status === "active";

  return (
    <Card className={`${isExpiringSoon ? "border-orange-300" : ""}`} data-testid={`card-my-pkg-${up.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base">{up.package.name}</CardTitle>
          <StatusBadge status={up.status} />
        </div>
        {up.package.description && <CardDescription className="text-xs">{up.package.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {up.package.benefits.map((b, i) => <BenefitPill key={i} benefit={b} />)}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t pt-2">
          <span className="flex items-center gap-1"><ShoppingBag className="h-3 w-3" /> Purchased: {fmtDate(up.purchasedAt)}</span>
          <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Activated: {fmtDate(up.activatedAt)}</span>
          <span className={`flex items-center gap-1 col-span-2 ${isExpiringSoon ? "text-orange-600 font-medium" : ""}`}>
            <CalendarClock className="h-3 w-3" />
            {up.expiresAt
              ? days === 0
                ? "Expires today"
                : `Expires: ${fmtDate(up.expiresAt)} (${days} day${days !== 1 ? "s" : ""} left)`
              : "No expiry"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PackagesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [location] = useLocation();
  const [confirmPurchase, setConfirmPurchase] = useState<{ pkg: PkgData; method: "card" | "wallet" } | null>(null);
  const [tab, setTab] = useState("browse");

  const isProvider = user?.role === "provider";

  // Handle redirect back from Stripe with ?activated=ID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const activatedId = params.get("activated");
    if (activatedId) {
      qc.invalidateQueries({ queryKey: QK.myPackages() });
      toast({ title: t("packages_page.package_activated_success") });
      window.history.replaceState({}, "", "/packages");
    }
    if (params.get("cancelled")) {
      toast({ title: t("packages_page.payment_cancelled"), variant: "destructive" });
      window.history.replaceState({}, "", "/packages");
    }
  }, []);

  const { format: fmtMoney } = useCurrency();

  const { data: availablePackages = [], isLoading: loadingPkgs } = useQuery<PkgData[]>({
    queryKey: QK.packages(),
    enabled: !!user,
  });

  const { data: myPackages = [], isLoading: loadingMine } = useQuery<UserPkgDetail[]>({
    queryKey: QK.myPackages(),
    enabled: !!user,
  });

  const { data: walletData } = useQuery<WalletData>({
    queryKey: QK.wallet(),
    enabled: !!user,
  });
  const walletBalanceUSD = walletData ? Number(walletData.balance) : undefined;

  const purchaseMutation = useMutation({
    mutationFn: async ({ pkgId, method }: { pkgId: string; method: string }) => {
      const res = await apiRequest("POST", `/api/packages/${pkgId}/purchase`, { paymentMethod: method });
      return res.json();
    },
    onSuccess: (data: any) => {
      setConfirmPurchase(null);
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: t("packages_page.package_activated") });
        qc.invalidateQueries({ queryKey: QK.myPackages() });
        qc.invalidateQueries({ queryKey: QK.wallet() });
        qc.invalidateQueries({ queryKey: QK.walletTransactions() });
        setTab("mine");
      }
    },
    onError: (e: any) => toast({ title: e?.message ?? t("packages_page.purchase_failed"), variant: "destructive" }),
  });

  const ownedPackageIds = new Set(myPackages.filter(u => u.status === "active").map(u => u.packageId));

  const activePackages   = myPackages.filter(u => u.status === "active");
  const inactivePackages = myPackages.filter(u => u.status !== "active");

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Gift className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">{t("packages_page.sign_in_prompt")}</p>
        <Button onClick={() => navigate("/auth")} data-testid="button-sign-in">{t("common.sign_in", "Sign In")}</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} data-testid="button-back">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              {isProvider
                ? <><Stethoscope className="h-6 w-6 text-primary" /> {t("packages_page.provider_page_title")}</>
                : <><Gift className="h-6 w-6 text-primary" /> {t("packages_page.patient_page_title")}</>
              }
            </h1>
            <p className="text-sm text-muted-foreground">
              {isProvider
                ? t("packages_page.provider_page_desc")
                : t("packages_page.patient_page_desc")
              }
            </p>
          </div>
        </div>

        {/* Role notice + wallet balance chip */}
        <div className="flex flex-wrap items-center gap-2">
          {user && (
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" />
              {isProvider
                ? t("packages_page.provider_role_notice")
                : t("packages_page.patient_role_notice")
              }
            </div>
          )}
          {walletBalanceUSD !== undefined && (
            <a href="/wallet" className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
              data-testid="link-wallet-balance-chip"
            >
              <Wallet className="h-3.5 w-3.5" />
              Wallet: <span className="font-bold">{fmtMoney(walletBalanceUSD)}</span>
            </a>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="browse" data-testid="tab-browse">
              <ShoppingBag className="h-4 w-4 mr-1.5" /> {t("packages_page.browse")}
            </TabsTrigger>
            <TabsTrigger value="mine" data-testid="tab-mine">
              <CheckCircle className="h-4 w-4 mr-1.5" /> {t("packages_page.my_packages")}
              {activePackages.length > 0 && (
                <span className="ml-1.5 bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {activePackages.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Browse ── */}
          <TabsContent value="browse" className="pt-6">
            {loadingPkgs && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1,2,3].map(i => <Card key={i} className="h-64 animate-pulse bg-muted" />)}
              </div>
            )}
            {!loadingPkgs && availablePackages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Gift className="h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">{t("packages_page.no_packages_region")}</p>
              </div>
            )}
            {!loadingPkgs && availablePackages.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {availablePackages.map(pkg => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    owned={ownedPackageIds.has(pkg.id)}
                    onBuy={(p, method) => setConfirmPurchase({ pkg: p, method })}
                    walletBalanceUSD={walletBalanceUSD}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── My Packages ── */}
          <TabsContent value="mine" className="pt-6 space-y-6">
            {loadingMine && <p className="text-muted-foreground text-center py-8">{t("packages_page.loading")}</p>}

            {!loadingMine && myPackages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <ShoppingBag className="h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">{t("packages_page.no_packages_owned")}</p>
                <Button variant="outline" onClick={() => setTab("browse")} data-testid="button-browse-pkgs">{t("packages_page.browse_packages")}</Button>
              </div>
            )}

            {activePackages.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("packages_page.active_packages")}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activePackages.map(up => <MyPackageCard key={up.id} up={up} />)}
                </div>
              </div>
            )}

            {inactivePackages.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("packages_page.previous_packages")}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 opacity-70">
                  {inactivePackages.map(up => <MyPackageCard key={up.id} up={up} />)}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Purchase confirmation */}
      <AlertDialog open={!!confirmPurchase} onOpenChange={v => { if (!v) setConfirmPurchase(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("packages_page.confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {confirmPurchase && (
                  <p>
                    {t("packages_page.confirm_desc_prefix")}{" "}
                    <strong>{confirmPurchase.pkg.name}</strong>{" "}
                    {t("packages_page.confirm_desc_for")}{" "}
                    {Number(confirmPurchase.pkg.price) === 0
                      ? t("packages_page.free")
                      : fmtMoney(Number(confirmPurchase.pkg.price))
                    }{" "}
                    {t("packages_page.confirm_desc_via")}{" "}
                    {confirmPurchase.method === "wallet"
                      ? t("packages_page.wallet_balance")
                      : t("packages_page.card_payment")
                    }.{" "}
                    {t("packages_page.confirm_desc_valid", { days: confirmPurchase.pkg.durationDays })}
                  </p>
                )}
                {confirmPurchase?.method === "wallet" && walletBalanceUSD !== undefined && (
                  <div className="rounded-lg border bg-muted/40 px-4 py-3 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Wallet className="h-4 w-4" />
                      Your wallet balance
                    </span>
                    <span className="font-bold text-base" data-testid="text-confirm-wallet-balance">
                      {fmtMoney(walletBalanceUSD)}
                    </span>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmPurchase && purchaseMutation.mutate({ pkgId: confirmPurchase.pkg.id, method: confirmPurchase.method })}
              disabled={purchaseMutation.isPending}
              data-testid="button-confirm-purchase"
            >
              {purchaseMutation.isPending ? t("packages_page.processing") : t("packages_page.confirm_btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
