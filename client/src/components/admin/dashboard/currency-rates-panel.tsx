import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RefreshCw, Edit2, Check, X, AlertTriangle, Clock,
  TrendingUp, Loader2, RotateCcw, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface CurrencyRate {
  code: string;
  rateFromUsd: number;
  fetchedAt: string | null;
  isManualOverride: boolean;
  source: "live" | "manual" | "fallback";
}

interface RatesResponse {
  currencies: CurrencyRate[];
}

const CURRENCY_FLAGS: Record<string, string> = {
  USD: "🇺🇸",
  HUF: "🇭🇺",
  IRR: "🇮🇷",
  GBP: "🇬🇧",
  EUR: "🇪🇺",
};

const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar",
  HUF: "Hungarian Forint",
  IRR: "Iranian Rial",
  GBP: "British Pound",
  EUR: "Euro",
};

function formatRelativeTime(isoString: string | null, labels: { never: string; justNow: string; minutesAgo: (n: number) => string; hoursAgo: (n: number) => string; daysAgo: (n: number) => string }): string {
  if (!isoString) return labels.never;
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return labels.justNow;
  if (mins < 60) return labels.minutesAgo(mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return labels.hoursAgo(hrs);
  return labels.daysAgo(Math.floor(hrs / 24));
}

export function CurrencyRatesPanel() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data, isLoading } = useQuery<RatesResponse>({
    queryKey: ["/api/admin/currency-rates"],
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/currency-rates/sync").then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/currency-rates"] });
      toast({ title: t("admin.rates_synced"), description: t("admin.rates_sync_desc") });
    },
    onError: () => toast({ title: t("admin.sync_failed"), description: t("admin.rates_sync_failed_desc"), variant: "destructive" }),
  });

  const overrideMutation = useMutation({
    mutationFn: ({ code, rate }: { code: string; rate: number }) =>
      apiRequest("PATCH", `/api/admin/currency-rates/${code}`, { rate }).then(r => r.json()),
    onSuccess: (_, { code }) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/currency-rates"] });
      setEditingCode(null);
      toast({ title: t("admin.rate_overridden"), description: t("admin.rate_override_desc", { code }) });
    },
    onError: () => toast({ title: t("admin.override_failed"), description: t("admin.override_save_failed"), variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: (code: string) =>
      apiRequest("POST", `/api/admin/currency-rates/${code}/reset`).then(r => r.json()),
    onSuccess: (_, code) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/currency-rates"] });
      toast({ title: t("admin.override_cleared"), description: t("admin.override_cleared_desc", { code }) });
    },
    onError: () => toast({ title: t("admin.reset_failed"), variant: "destructive" }),
  });

  function startEdit(rate: CurrencyRate) {
    setEditingCode(rate.code);
    setEditValue(String(rate.rateFromUsd));
  }

  function cancelEdit() {
    setEditingCode(null);
    setEditValue("");
  }

  function confirmEdit(code: string) {
    const parsed = parseFloat(editValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast({ title: t("admin.invalid_rate"), description: t("admin.positive_number"), variant: "destructive" });
      return;
    }
    overrideMutation.mutate({ code, rate: parsed });
  }

  const currencies = data?.currencies ?? [];
  const hasManualOverrides = currencies.some(c => c.isManualOverride);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{t("admin.exchange_rates_title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("admin.exchange_rates_desc")}
            </p>
          </div>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          data-testid="button-sync-rates"
          className="shrink-0"
        >
          {syncMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin me-2" />
          ) : (
            <RefreshCw className="h-4 w-4 me-2" />
          )}
          {t("admin.sync_now")}
        </Button>
      </div>

      {hasManualOverrides && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {t("admin.manual_overrides_warning")}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-36 rounded-xl bg-muted animate-pulse" />
            ))
          : currencies.map(rate => {
              const isEditing = editingCode === rate.code;
              const isUSD = rate.code === "USD";

              return (
                <Card
                  key={rate.code}
                  className={cn(
                    "relative transition-shadow",
                    rate.isManualOverride && "border-amber-400 dark:border-amber-600"
                  )}
                  data-testid={`card-rate-${rate.code}`}
                >
                  {rate.isManualOverride && (
                    <div className="absolute top-2 end-2">
                      <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">
                         {t("admin.config.manual", "Manual")}
                      </Badge>
                    </div>
                  )}

                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{CURRENCY_FLAGS[rate.code] ?? "💱"}</span>
                      <div>
                        <CardTitle className="text-base">{rate.code}</CardTitle>
                         <CardDescription className="text-xs">{t(`admin.config.currency_${rate.code}`, CURRENCY_NAMES[rate.code] ?? rate.code)}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {isEditing ? (
                      <div className="space-y-2">
                        <Label htmlFor={`rate-input-${rate.code}`} className="text-xs">
                           {t("admin.config.one_usd_equals", "1 USD =")}
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id={`rate-input-${rate.code}`}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            type="number"
                            min="0"
                            step="any"
                            className="h-8 text-sm"
                            data-testid={`input-rate-${rate.code}`}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter") confirmEdit(rate.code);
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                          <Button
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => confirmEdit(rate.code)}
                            disabled={overrideMutation.isPending}
                            data-testid={`button-confirm-rate-${rate.code}`}
                          >
                            {overrideMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={cancelEdit}
                            data-testid={`button-cancel-rate-${rate.code}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-end justify-between">
                        <div>
                           <p className="text-xs text-muted-foreground">{t("admin.config.one_usd_equals", "1 USD =")}</p>
                          <p className="text-2xl font-bold tabular-nums" data-testid={`text-rate-value-${rate.code}`}>
                            {isUSD ? "1" : rate.rateFromUsd.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">{rate.code}</p>
                        </div>
                        {!isUSD && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => startEdit(rate)}
                            data-testid={`button-edit-rate-${rate.code}`}
                          >
                            <Edit2 className="h-3 w-3 me-1" />
                             {t("admin.config.override", "Override")}
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-border/50">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                         <span>{formatRelativeTime(rate.fetchedAt, {
                           never: t("admin.config.never", "Never"),
                           justNow: t("admin.config.just_now", "Just now"),
                           minutesAgo: n => t("admin.config.minutes_ago", "{{count}}m ago", { count: n }),
                           hoursAgo: n => t("admin.config.hours_ago", "{{count}}h ago", { count: n }),
                           daysAgo: n => t("admin.config.days_ago", "{{count}}d ago", { count: n }),
                         })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-xs",
                            rate.source === "live" && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                            rate.source === "manual" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                            rate.source === "fallback" && "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          )}
                        >
                          {rate.source}
                        </Badge>
                        {rate.isManualOverride && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => resetMutation.mutate(rate.code)}
                            disabled={resetMutation.isPending}
                             title={t("admin.config.clear_override_title", "Clear override — next sync will restore live rate")}
                            data-testid={`button-reset-override-${rate.code}`}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
             <CardTitle className="text-sm font-medium">{t("admin.config.how_rates_used", "How rates are used")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
             <strong className="text-foreground">{t("admin.config.wallet_debiting", "Wallet debiting")}</strong> — {t("admin.config.wallet_debiting_desc", "when a member pays with wallet credits, the platform converts the appointment's USD total to the local currency amount deducted from their balance.")}
          </p>
          <p>
             <strong className="text-foreground">{t("admin.config.revenue_engine", "Revenue engine")}</strong> — {t("admin.config.revenue_engine_desc", "commission, tax, and platform fee calculations all operate in USD; the rates here determine how those figures display in HUF or IRR on provider dashboards and invoices.")}
          </p>
          <p>
             <strong className="text-foreground">{t("admin.config.service_prices", "Service prices")}</strong> — {t("admin.config.service_prices_desc", "service prices are stored natively in the provider's currency and are never affected by these rates. Rates only apply to USD-denominated accounting values.")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
