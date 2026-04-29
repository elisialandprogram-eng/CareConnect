import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Wallet, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import type { ProviderEarning } from "@shared/schema";

interface EarningsPayload {
  earnings: ProviderEarning[];
  summary: {
    totalEarnings: string;
    pendingAmount: string;
    paidAmount: string;
    platformRevenue: string;
    count: number;
  };
}

function formatHUF(value: number | string) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!isFinite(n)) return "0 HUF";
  return `${Math.round(n).toLocaleString("hu-HU")} HUF`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "—";
  }
}

export default function ProviderEarnings() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<EarningsPayload>({
    queryKey: ["/api/provider/earnings"],
  });

  const summary = data?.summary;
  const earnings = data?.earnings ?? [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild data-testid="link-back-dashboard">
            <Link href="/provider/dashboard">
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t("common.back", "Back")}
            </Link>
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-earnings">
            {t("provider_earnings.title", "Earnings & Payouts")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t(
              "provider_earnings.subtitle",
              "Track your earnings from completed appointments and view payout status.",
            )}
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card data-testid="card-total-earnings">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("provider_earnings.total", "Total earnings")}
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-summary-total">
                  {formatHUF(summary?.totalEarnings || 0)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t("provider_earnings.from_appointments", "From {{count}} completed appointment(s)", { count: summary?.count || 0 })}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-pending-payouts">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("provider_earnings.pending", "Pending payouts")}
              </CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-summary-pending">
                  {formatHUF(summary?.pendingAmount || 0)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t("provider_earnings.awaiting_payout", "Awaiting payout from admin")}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-paid-amount">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("provider_earnings.paid", "Paid out")}
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-summary-paid">
                  {formatHUF(summary?.paidAmount || 0)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t("provider_earnings.already_received", "Already received")}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Earnings list */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  {t("provider_earnings.list_title", "Earnings history")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "provider_earnings.list_subtitle",
                    "Each completed and paid appointment generates an earnings record.",
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : earnings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-earnings">
                {t(
                  "provider_earnings.empty",
                  "No earnings yet. Complete appointments to start earning.",
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("provider_earnings.date", "Date")}</TableHead>
                      <TableHead className="text-right">{t("provider_earnings.total_amount", "Total")}</TableHead>
                      <TableHead className="text-right">{t("provider_earnings.platform_fee", "Platform fee")}</TableHead>
                      <TableHead className="text-right">{t("provider_earnings.your_earning", "Your earning")}</TableHead>
                      <TableHead>{t("provider_earnings.status", "Status")}</TableHead>
                      <TableHead>{t("provider_earnings.paid_on", "Paid on")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {earnings.map((e) => (
                      <TableRow key={e.id} data-testid={`row-earning-${e.id}`}>
                        <TableCell data-testid={`text-earning-date-${e.id}`}>
                          {formatDate(e.createdAt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatHUF(e.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          −{formatHUF(e.platformFee)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold" data-testid={`text-earning-amount-${e.id}`}>
                          {formatHUF(e.providerEarning)}
                        </TableCell>
                        <TableCell>
                          {e.status === "paid" ? (
                            <Badge
                              className="bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
                              data-testid={`badge-status-${e.id}`}
                            >
                              {t("provider_earnings.status_paid", "Paid")}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                              data-testid={`badge-status-${e.id}`}
                            >
                              {t("provider_earnings.status_pending", "Pending")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground" data-testid={`text-paid-at-${e.id}`}>
                          {formatDate(e.paidAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
