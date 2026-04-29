import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Banknote, Clock, CheckCircle2, TrendingUp, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProviderEarning } from "@shared/schema";

type AdminEarning = ProviderEarning & {
  providerName?: string;
  appointmentNumber?: string | null;
};

interface EarningsPayload {
  earnings: AdminEarning[];
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

export default function AdminEarnings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "pending" | "paid">("all");
  const [payTarget, setPayTarget] = useState<AdminEarning | null>(null);
  const [payoutRef, setPayoutRef] = useState("");

  const { data, isLoading } = useQuery<EarningsPayload>({
    queryKey: ["/api/admin/earnings"],
  });

  const summary = data?.summary;
  const earnings = data?.earnings ?? [];
  const filtered = earnings.filter((e) => filter === "all" || e.status === filter);

  const markPaid = useMutation({
    mutationFn: async ({ id, payoutReference }: { id: string; payoutReference?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/earnings/${id}/pay`, { payoutReference });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/earnings"] });
      toast({ title: t("admin_earnings.paid_toast", "Earning marked as paid") });
      setPayTarget(null);
      setPayoutRef("");
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: t("admin_earnings.paid_error", "Failed to mark as paid"),
        description: err.message,
      });
    },
  });

  const backfill = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/earnings/backfill`, {});
      return res.json();
    },
    onSuccess: (result: { created: number; skipped: number; total: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/earnings"] });
      toast({
        title: t("admin_earnings.backfill_done", "Backfill complete"),
        description: t(
          "admin_earnings.backfill_result",
          "Created {{created}}, already existed {{skipped}}, total {{total}}.",
          result,
        ),
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Backfill failed", description: err.message });
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild data-testid="link-back-admin">
            <Link href="/admin">
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t("common.back", "Back")}
            </Link>
          </Button>
        </div>

        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-admin-earnings">
              {t("admin_earnings.title", "Provider earnings & payouts")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t(
                "admin_earnings.subtitle",
                "Manage provider payouts and view platform revenue.",
              )}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => backfill.mutate()}
            disabled={backfill.isPending}
            data-testid="button-backfill"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${backfill.isPending ? "animate-spin" : ""}`} />
            {t("admin_earnings.backfill", "Backfill")}
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card data-testid="card-platform-revenue">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("admin_earnings.platform_revenue", "Platform revenue")}
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold text-primary" data-testid="text-platform-revenue">
                  {formatHUF(summary?.platformRevenue || 0)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t("admin_earnings.from_fees", "Total platform fees")}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-total-payouts">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("admin_earnings.total_provider_earnings", "Total provider earnings")}
              </CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-total-provider-earnings">
                  {formatHUF(summary?.totalEarnings || 0)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t("admin_earnings.across_providers", "Across {{count}} earnings record(s)", { count: summary?.count || 0 })}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-pending-total">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("admin_earnings.pending", "Pending")}
              </CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-pending-total">
                  {formatHUF(summary?.pendingAmount || 0)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t("admin_earnings.awaiting_payout", "Awaiting payout")}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-paid-total">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("admin_earnings.paid", "Paid out")}
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-paid-total">
                  {formatHUF(summary?.paidAmount || 0)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t("admin_earnings.lifetime", "Lifetime payouts")}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="mb-4 flex gap-2">
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
            data-testid="filter-all"
          >
            {t("admin_earnings.filter_all", "All")} ({earnings.length})
          </Button>
          <Button
            size="sm"
            variant={filter === "pending" ? "default" : "outline"}
            onClick={() => setFilter("pending")}
            data-testid="filter-pending"
          >
            {t("admin_earnings.filter_pending", "Pending")} ({earnings.filter(e => e.status === "pending").length})
          </Button>
          <Button
            size="sm"
            variant={filter === "paid" ? "default" : "outline"}
            onClick={() => setFilter("paid")}
            data-testid="filter-paid"
          >
            {t("admin_earnings.filter_paid", "Paid")} ({earnings.filter(e => e.status === "paid").length})
          </Button>
        </div>

        {/* Earnings list */}
        <Card>
          <CardHeader>
            <CardTitle>{t("admin_earnings.list_title", "All earnings")}</CardTitle>
            <CardDescription>
              {t(
                "admin_earnings.list_subtitle",
                "Each completed and paid appointment generates one earning record.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-earnings">
                {t("admin_earnings.empty", "No earnings records found.")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin_earnings.date", "Date")}</TableHead>
                      <TableHead>{t("admin_earnings.provider", "Provider")}</TableHead>
                      <TableHead>{t("admin_earnings.appointment", "Appointment")}</TableHead>
                      <TableHead className="text-right">{t("admin_earnings.total", "Total")}</TableHead>
                      <TableHead className="text-right">{t("admin_earnings.fee", "Fee")}</TableHead>
                      <TableHead className="text-right">{t("admin_earnings.earning", "Earning")}</TableHead>
                      <TableHead>{t("admin_earnings.status", "Status")}</TableHead>
                      <TableHead className="text-right">{t("admin_earnings.actions", "Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((e) => (
                      <TableRow key={e.id} data-testid={`row-earning-${e.id}`}>
                        <TableCell className="text-sm">{formatDate(e.createdAt)}</TableCell>
                        <TableCell data-testid={`text-provider-name-${e.id}`}>
                          {e.providerName || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {e.appointmentNumber || e.appointmentId.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatHUF(e.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-primary">
                          {formatHUF(e.platformFee)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatHUF(e.providerEarning)}
                        </TableCell>
                        <TableCell>
                          {e.status === "paid" ? (
                            <Badge
                              className="bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
                              data-testid={`badge-status-${e.id}`}
                            >
                              {t("admin_earnings.status_paid", "Paid")}
                              {e.paidAt && (
                                <span className="ml-1 text-[10px] opacity-70">
                                  {formatDate(e.paidAt)}
                                </span>
                              )}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                              data-testid={`badge-status-${e.id}`}
                            >
                              {t("admin_earnings.status_pending", "Pending")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {e.status === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => setPayTarget(e)}
                              data-testid={`button-mark-paid-${e.id}`}
                            >
                              {t("admin_earnings.mark_paid", "Mark paid")}
                            </Button>
                          )}
                          {e.status === "paid" && e.payoutReference && (
                            <span
                              className="text-xs text-muted-foreground font-mono"
                              data-testid={`text-payout-ref-${e.id}`}
                            >
                              {e.payoutReference}
                            </span>
                          )}
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

      {/* Mark paid dialog */}
      <Dialog
        open={!!payTarget}
        onOpenChange={(open) => {
          if (!open) {
            setPayTarget(null);
            setPayoutRef("");
          }
        }}
      >
        <DialogContent data-testid="dialog-mark-paid">
          <DialogHeader>
            <DialogTitle>{t("admin_earnings.confirm_payout", "Confirm payout")}</DialogTitle>
            <DialogDescription>
              {t(
                "admin_earnings.confirm_payout_desc",
                "Mark this earning as paid? The provider will be notified.",
              )}
            </DialogDescription>
          </DialogHeader>
          {payTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("admin_earnings.provider", "Provider")}:</span>
                  <span className="font-medium">{payTarget.providerName || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("admin_earnings.amount", "Amount")}:</span>
                  <span className="font-bold">{formatHUF(payTarget.providerEarning)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payout-ref">
                  {t("admin_earnings.payout_ref", "Payout reference (optional)")}
                </Label>
                <Input
                  id="payout-ref"
                  value={payoutRef}
                  onChange={(e) => setPayoutRef(e.target.value)}
                  placeholder={t("admin_earnings.payout_ref_placeholder", "e.g. bank transfer ID")}
                  data-testid="input-payout-ref"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPayTarget(null);
                setPayoutRef("");
              }}
              data-testid="button-cancel-pay"
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={() =>
                payTarget && markPaid.mutate({ id: payTarget.id, payoutReference: payoutRef.trim() || undefined })
              }
              disabled={markPaid.isPending}
              data-testid="button-confirm-pay"
            >
              {markPaid.isPending
                ? t("common.saving", "Saving…")
                : t("admin_earnings.confirm_mark_paid", "Confirm payout")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
