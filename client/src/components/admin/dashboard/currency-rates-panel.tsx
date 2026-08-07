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

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "Never";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function CurrencyRatesPanel() {
  const { toast } = useToast();
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
      toast({ title: "Rates synced", description: "Live rates fetched from open.er-api.com" });
    },
    onError: () => toast({ title: "Sync failed", description: "Could not reach the exchange rate API", variant: "destructive" }),
  });

  const overrideMutation = useMutation({
    mutationFn: ({ code, rate }: { code: string; rate: number }) =>
      apiRequest("PATCH", `/api/admin/currency-rates/${code}`, { rate }).then(r => r.json()),
    onSuccess: (_, { code }) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/currency-rates"] });
      setEditingCode(null);
      toast({ title: "Rate overridden", description: `${code} rate updated and cache cleared` });
    },
    onError: () => toast({ title: "Override failed", description: "Could not save the rate override", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: (code: string) =>
      apiRequest("POST", `/api/admin/currency-rates/${code}/reset`).then(r => r.json()),
    onSuccess: (_, code) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/currency-rates"] });
      toast({ title: "Override cleared", description: `${code} will use live rates on next sync` });
    },
    onError: () => toast({ title: "Reset failed", variant: "destructive" }),
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
      toast({ title: "Invalid rate", description: "Enter a positive number", variant: "destructive" });
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
            <h2 className="text-xl font-bold">Exchange Rates</h2>
            <p className="text-sm text-muted-foreground">
              Manage USD-based exchange rates used for wallet debiting and revenue calculations.
              Rates sync automatically every hour from open.er-api.com.
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
          Sync Now
        </Button>
      </div>

      {hasManualOverrides && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            One or more rates have manual overrides active. Live sync will not update these until the override is cleared.
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
                        Manual
                      </Badge>
                    </div>
                  )}

                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{CURRENCY_FLAGS[rate.code] ?? "💱"}</span>
                      <div>
                        <CardTitle className="text-base">{rate.code}</CardTitle>
                        <CardDescription className="text-xs">{CURRENCY_NAMES[rate.code] ?? rate.code}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {isEditing ? (
                      <div className="space-y-2">
                        <Label htmlFor={`rate-input-${rate.code}`} className="text-xs">
                          1 USD =
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
                          <p className="text-xs text-muted-foreground">1 USD =</p>
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
                            Override
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-border/50">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatRelativeTime(rate.fetchedAt)}</span>
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
                            title="Clear override — next sync will restore live rate"
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
            <CardTitle className="text-sm font-medium">How rates are used</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Wallet debiting</strong> — when a patient pays
            with wallet credits, the platform converts the appointment's USD total to the local
            currency amount deducted from their balance.
          </p>
          <p>
            <strong className="text-foreground">Revenue engine</strong> — commission, tax, and
            platform fee calculations all operate in USD; the rates here determine how those
            figures display in HUF or IRR on provider dashboards and invoices.
          </p>
          <p>
            <strong className="text-foreground">Service prices</strong> — service prices are
            stored natively in the provider's currency and are never affected by these rates.
            Rates only apply to USD-denominated accounting values.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
