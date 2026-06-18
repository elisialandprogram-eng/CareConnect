import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CreditCard, Wallet, Banknote, Building, Globe, Loader2,
  CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown,
  RefreshCw, Settings2, Shield, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PaymentProvider {
  id: string;
  key: string;
  label: string;
  description: string;
  isEnabled: boolean;
  environment: "sandbox" | "production";
  priority: number;
  countryCodes: string[] | null;
  currencyCodes: string[] | null;
  credentials: Record<string, string>;
  featureFlags: Record<string, unknown>;
  maintenanceMode: boolean;
  healthStatus: "ok" | "error" | "unknown";
  lastHealthCheck: string | null;
  lastTestResult: { success: boolean; message: string; latencyMs?: number } | null;
}

const PROVIDER_ICONS: Record<string, React.ElementType> = {
  wallet: Wallet,
  cash: Banknote,
  bank_transfer: Building,
  stripe: CreditCard,
  razorpay: CreditCard,
  paypal: Globe,
  crypto: Zap,
  apple_pay: CreditCard,
  google_pay: CreditCard,
};

const PROVIDER_CREDENTIAL_FIELDS: Record<string, Array<{ key: string; label: string; sensitive?: boolean }>> = {
  stripe: [
    { key: "publishableKey", label: "Publishable Key" },
    { key: "secretKey", label: "Secret Key", sensitive: true },
    { key: "webhookSecret", label: "Webhook Secret", sensitive: true },
  ],
  razorpay: [
    { key: "keyId", label: "Key ID" },
    { key: "keySecret", label: "Key Secret", sensitive: true },
  ],
  paypal: [
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client Secret", sensitive: true },
  ],
  crypto: [
    { key: "walletAddress", label: "Wallet Address" },
    { key: "supportedCoins", label: "Supported Coins (comma-separated)" },
  ],
};

function HealthBadge({ status, lastCheck }: { status: string; lastCheck: string | null }) {
  if (status === "ok")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Connected
      </Badge>
    );
  if (status === "error")
    return (
      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800 gap-1">
        <XCircle className="h-3 w-3" /> Error
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Clock className="h-3 w-3" />
      {lastCheck ? "Unchecked" : "Never tested"}
    </Badge>
  );
}

function ProviderCard({ provider, onUpdate, onTest, isUpdating, isTesting }: {
  provider: PaymentProvider;
  onUpdate: (key: string, updates: Partial<PaymentProvider>) => void;
  onTest: (key: string) => void;
  isUpdating: boolean;
  isTesting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [localCountries, setLocalCountries] = useState(provider.countryCodes?.join(", ") ?? "");
  const [localCurrencies, setLocalCurrencies] = useState(provider.currencyCodes?.join(", ") ?? "");
  const [localPriority, setLocalPriority] = useState(String(provider.priority));
  const [localCreds, setLocalCreds] = useState<Record<string, string>>(provider.credentials ?? {});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const Icon = PROVIDER_ICONS[provider.key] ?? CreditCard;
  const credFields = PROVIDER_CREDENTIAL_FIELDS[provider.key] ?? [];

  const saveConfig = () => {
    const countryCodes = localCountries.trim()
      ? localCountries.split(",").map(c => c.trim().toUpperCase()).filter(Boolean)
      : null;
    const currencyCodes = localCurrencies.trim()
      ? localCurrencies.split(",").map(c => c.trim().toUpperCase()).filter(Boolean)
      : null;
    onUpdate(provider.key, {
      priority: parseInt(localPriority, 10) || provider.priority,
      countryCodes,
      currencyCodes,
      credentials: localCreds,
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn(
        "transition-all",
        provider.isEnabled && !provider.maintenanceMode
          ? "border-primary/20 bg-primary/2"
          : "opacity-70",
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
              provider.isEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}>
              <Icon className="h-5 w-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm font-semibold">{provider.label}</CardTitle>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  #{provider.priority}
                </Badge>
                <Badge variant="outline" className={cn(
                  "text-[10px] px-1.5 py-0",
                  provider.environment === "production"
                    ? "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400"
                    : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400",
                )}>
                  {provider.environment}
                </Badge>
                {provider.maintenanceMode && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Maintenance
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{provider.description}</p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <HealthBadge status={provider.healthStatus} lastCheck={provider.lastHealthCheck} />
              <Switch
                checked={provider.isEnabled}
                onCheckedChange={checked => onUpdate(provider.key, { isEnabled: checked })}
                disabled={isUpdating}
                data-testid={`toggle-provider-${provider.key}`}
                aria-label={`${provider.isEnabled ? "Disable" : "Enable"} ${provider.label}`}
              />
            </div>
          </div>

          {provider.lastTestResult && (
            <div className={cn(
              "mt-2 text-xs rounded-md px-3 py-1.5 flex items-center gap-2",
              provider.lastTestResult.success
                ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400"
                : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400",
            )}>
              {provider.lastTestResult.success
                ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                : <XCircle className="h-3 w-3 shrink-0" />}
              <span>{provider.lastTestResult.message}</span>
              {provider.lastTestResult.latencyMs !== undefined && (
                <span className="ml-auto text-[10px] opacity-60">{provider.lastTestResult.latencyMs}ms</span>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-0 pb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {provider.countryCodes
              ? <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{provider.countryCodes.join(", ")}</span>
              : <span className="flex items-center gap-1"><Globe className="h-3 w-3" />All countries</span>}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => onTest(provider.key)}
              disabled={isTesting}
              data-testid={`btn-test-${provider.key}`}
            >
              {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Test
            </Button>
            <CollapsibleTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
                data-testid={`btn-config-${provider.key}`}
              >
                <Settings2 className="h-3 w-3" />
                Config
                <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardContent>

        <CollapsibleContent>
          <div className="border-t border-border/60 px-4 py-4 space-y-4 bg-muted/20">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Environment</Label>
                <Select
                  value={provider.environment}
                  onValueChange={v => onUpdate(provider.key, { environment: v as "sandbox" | "production" })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Priority (lower = shown first)</Label>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={localPriority}
                  onChange={e => setLocalPriority(e.target.value)}
                  className="h-8 text-xs"
                  data-testid={`input-priority-${provider.key}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Country restriction (comma-separated ISO codes, blank = all)</Label>
                <Input
                  placeholder="e.g. HU, US, IN"
                  value={localCountries}
                  onChange={e => setLocalCountries(e.target.value)}
                  className="h-8 text-xs font-mono"
                  data-testid={`input-countries-${provider.key}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency restriction (comma-separated, blank = all)</Label>
                <Input
                  placeholder="e.g. HUF, USD, EUR"
                  value={localCurrencies}
                  onChange={e => setLocalCurrencies(e.target.value)}
                  className="h-8 text-xs font-mono"
                  data-testid={`input-currencies-${provider.key}`}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id={`maint-${provider.key}`}
                checked={provider.maintenanceMode}
                onCheckedChange={checked => onUpdate(provider.key, { maintenanceMode: checked })}
                data-testid={`toggle-maintenance-${provider.key}`}
              />
              <Label htmlFor={`maint-${provider.key}`} className="text-xs cursor-pointer">
                Maintenance mode (hides from checkout even when enabled)
              </Label>
            </div>

            {credFields.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Credentials
                </p>
                {credFields.map(f => (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="text-xs">{f.label}</Label>
                    <div className="flex gap-2">
                      <Input
                        type={f.sensitive && !showSecrets[f.key] ? "password" : "text"}
                        placeholder={f.sensitive ? "••••••••" : `Enter ${f.label}`}
                        value={localCreds[f.key] ?? ""}
                        onChange={e => setLocalCreds(c => ({ ...c, [f.key]: e.target.value }))}
                        className="h-8 text-xs font-mono flex-1"
                        data-testid={`input-cred-${provider.key}-${f.key}`}
                      />
                      {f.sensitive && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs shrink-0"
                          onClick={() => setShowSecrets(s => ({ ...s, [f.key]: !s[f.key] }))}
                        >
                          {showSecrets[f.key] ? "Hide" : "Show"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={saveConfig}
                disabled={isUpdating}
                data-testid={`btn-save-${provider.key}`}
              >
                {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Save configuration
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function PaymentProvidersPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: providers, isLoading } = useQuery<PaymentProvider[]>({
    queryKey: ["/api/admin/payment-providers"],
  });

  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async ({ key, updates }: { key: string; updates: Record<string, unknown> }) => {
      const res = await apiRequest("PUT", `/api/admin/payment-providers/${key}`, updates);
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err.message ?? "Update failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-providers/available"] });
      toast({ title: "Provider updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
    onSettled: () => setUpdatingKey(null),
  });

  const testMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest("POST", `/api/admin/payment-providers/${key}/test`, {});
      if (!res.ok) throw new Error("Test failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-providers"] });
      toast({
        title: data.testResult.success ? "Connection OK" : "Connection Failed",
        description: data.testResult.message,
        variant: data.testResult.success ? "default" : "destructive",
      });
    },
    onError: () => toast({ title: "Test failed", variant: "destructive" }),
    onSettled: () => setTestingKey(null),
  });

  const handleUpdate = (key: string, updates: Record<string, unknown>) => {
    setUpdatingKey(key);
    updateMutation.mutate({ key, updates });
  };

  const handleTest = (key: string) => {
    setTestingKey(key);
    testMutation.mutate(key);
  };

  const enabled = providers?.filter(p => p.isEnabled && !p.maintenanceMode) ?? [];
  const disabled = providers?.filter(p => !p.isEnabled || p.maintenanceMode) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Provider Registry
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enable, configure, and prioritize payment methods that appear in booking checkout.
          Changes take effect immediately — no deployment required.
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active providers", value: enabled.length, color: "text-emerald-600" },
          { label: "Disabled / maintenance", value: disabled.length, color: "text-muted-foreground" },
          { label: "Healthy connections", value: providers?.filter(p => p.healthStatus === "ok").length ?? 0, color: "text-emerald-600" },
          { label: "Connection errors", value: providers?.filter(p => p.healthStatus === "error").length ?? 0, color: "text-red-600" },
        ].map(stat => (
          <Card key={stat.label} className="p-3">
            <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </Card>
        ))}
      </div>

      {/* Active providers */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active in checkout</p>
        {enabled.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-4 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            No payment methods enabled — patients cannot complete checkout!
          </div>
        )}
        {enabled.map(p => (
          <ProviderCard
            key={p.key}
            provider={p}
            onUpdate={handleUpdate}
            onTest={handleTest}
            isUpdating={updatingKey === p.key}
            isTesting={testingKey === p.key}
          />
        ))}
      </div>

      {/* Disabled / future providers */}
      {disabled.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Disabled / future-ready</p>
          {disabled.map(p => (
            <ProviderCard
              key={p.key}
              provider={p}
              onUpdate={handleUpdate}
              onTest={handleTest}
              isUpdating={updatingKey === p.key}
              isTesting={testingKey === p.key}
            />
          ))}
        </div>
      )}

      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-blue-800 dark:text-blue-300 flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Country-based payment routing
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-blue-700 dark:text-blue-400 space-y-1.5">
          <p>Booking checkout dynamically shows only the enabled providers that match the patient's country.</p>
          <div className="grid sm:grid-cols-3 gap-2 mt-2">
            {[
              { country: "Hungary (HU)", methods: "Stripe, Bank Transfer, Wallet, Cash" },
              { country: "India (IN)", methods: "Razorpay, Wallet, Cash" },
              { country: "US / International", methods: "Stripe, PayPal, Wallet, Cash" },
            ].map(ex => (
              <div key={ex.country} className="rounded-md bg-blue-100/60 dark:bg-blue-900/20 p-2">
                <p className="font-semibold">{ex.country}</p>
                <p className="opacity-80">{ex.methods}</p>
              </div>
            ))}
          </div>
          <p className="mt-1 opacity-70">Set country codes in each provider's Config panel. Leave blank to allow globally.</p>
        </CardContent>
      </Card>
    </div>
  );
}
