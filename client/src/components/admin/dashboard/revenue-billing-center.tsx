import { formatDate } from "@/lib/datetime";
import { formatCount } from "@/lib/format-utils";
/**
 * Revenue & Billing Center
 * The single admin control panel for all pricing, fee, commission,
 * payment, travel, wallet, payout, and revenue-sharing configuration.
 */
import { useState, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { formatInCurrency } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DollarSign, Percent, CreditCard, Car, Wallet, Users, TrendingUp,
  Plus, Pencil, Trash2, Play, CheckCircle2, XCircle, AlertCircle,
  BarChart3, Clock, RefreshCw, Layers, Gift, Shield, Receipt,
  Zap, Target, Activity, RotateCcw, Tag, FileText, Loader2,
  Building2, Banknote,
} from "lucide-react";


const LazyInvoiceManagement = lazy(() =>
  import("@/components/admin/dashboard/invoice-management").then(m => ({ default: m.InvoiceManagement }))
);
const LazyAdminWallets = lazy(() =>
  import("@/components/admin/dashboard/admin-wallets").then(m => ({ default: m.AdminWallets }))
);
const LazyAdminPayoutsPanel = lazy(() =>
  import("@/components/admin/dashboard/admin-payouts").then(m => ({ default: m.AdminPayoutsPanel }))
);
const LazyAdminProviderWalletsPanel = lazy(() =>
  import("@/components/admin/dashboard/admin-provider-wallets").then(m => ({ default: m.AdminProviderWalletsPanel }))
);
const LazyPromoCodeManagement = lazy(() =>
  import("@/components/admin/dashboard/promo-code-management").then(m => ({ default: m.PromoCodeManagement }))
);

function PanelLoader() {
  const { t } = useTranslation();
  return (
    <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 animate-spin" />{t("common.loading", "Loading…")}
    </div>
  );
}

function useRevenueCenterText() {
  const { t } = useTranslation();
  return (key: string, fallback: string, options?: Record<string, unknown>): string =>
    String(t(`admin.revenue_center.${key}`, { defaultValue: fallback, ...options }));
}

// ── Simple helpers ────────────────────────────────────────────────────────────
const fmt = (v: string | number | undefined, fallback = "—") => {
  const n = Number(v);
  return Number.isFinite(n) ? formatInCurrency(n, "USD") : fallback;
};
const fmtPct = (v: string | number | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? `${n}%` : "—";
};

function StatusBadge({ enabled, maintenanceMode }: { enabled: boolean; maintenanceMode?: boolean }) {
  const { t } = useTranslation();
  if (maintenanceMode) return (
    <Badge variant="outline" className="text-amber-600 border-amber-400 gap-1">
       <AlertCircle className="h-3 w-3" />{t("admin.maintenance", "Maintenance")}
    </Badge>
  );
  return enabled
     ? <Badge variant="outline" className="text-emerald-600 border-emerald-400 gap-1"><CheckCircle2 className="h-3 w-3" />{t("admin.active", "Active")}</Badge>
     : <Badge variant="outline" className="text-muted-foreground gap-1"><XCircle className="h-3 w-3" />{t("admin.disabled", "Disabled")}</Badge>;
}

// ── Overview ──────────────────────────────────────────────────────────────────
interface Overview {
  rules: Record<string, { total: number; active: number }>;
  metrics: { totalRevenue: number; totalPayments: number; totalBookings: number };
}

function OverviewPanel() {
  const { t } = useTranslation();
  const { data: overview, isLoading } = useQuery<Overview>({ queryKey: ["/api/admin/revenue/overview"] });
  if (isLoading) return <div className="h-48 flex items-center justify-center text-muted-foreground">{t("common.loading", "Loading…")}</div>;
  const metrics = overview?.metrics;
  const rules = overview?.rules ?? {};
  const ruleSections = [
     { key: "platformFee",   label: t("admin.platform_fee_rules", "Platform Fee Rules"),  icon: Percent },
     { key: "commission",    label: t("admin.commission_rules", "Commission Rules"),     icon: TrendingUp },
     { key: "paymentMethod", label: t("admin.payment_rules", "Payment Rules"),        icon: CreditCard },
     { key: "travelFee",     label: t("admin.travel_fee_rules", "Travel Fee Rules"),     icon: Car },
     { key: "payoutConfig",  label: t("admin.payout_config", "Payout Config"),        icon: Clock },
     { key: "revenueShare",  label: t("admin.revenue_share_rules", "Revenue Share Rules"),  icon: Users },
     { key: "walletRules",   label: t("admin.wallet_rules", "Wallet Rules"),         icon: Wallet },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
           { label: t("admin.total_revenue", "Total Revenue"),  value: fmt(metrics?.totalRevenue) },
           { label: t("admin.total_payments", "Total Payments"), value: metrics?.totalPayments != null ? formatCount(metrics.totalPayments) : "—" },
           { label: t("admin.total_bookings", "Total Bookings"), value: metrics?.totalBookings != null ? formatCount(metrics.totalBookings) : "—" },
        ].map(c => (
          <Card key={c.label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{c.value}</p></CardContent>
          </Card>
        ))}
      </div>
      <div>
         <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t("admin.rule_engine_status", "Rule Engine Status")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {ruleSections.map(({ key, label, icon: Icon }) => {
            const s = rules[key] ?? { total: 0, active: 0 };
            return (
              <Card key={key} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">{label}</span>
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-lg font-bold text-emerald-600">{s.active}</span>
                   <span className="text-xs text-muted-foreground mb-0.5">/ {s.total} {t("admin.active", "active").toLowerCase()}</span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Generic delete dialog ─────────────────────────────────────────────────────
function DeleteDialog({
  target, onClose, onConfirm, isPending,
}: {
  target: { name: string } | null;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={!!target} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
           <DialogTitle>{t("admin.delete_rule", "Delete Rule")}</DialogTitle>
           <DialogDescription>{t("admin.delete_rule_confirm", "Delete")} <strong>{target?.name}</strong>? {t("admin.cannot_undone", "This cannot be undone.")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
           <Button variant="outline" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
           <Button variant="destructive" onClick={onConfirm} disabled={isPending}>{t("common.delete", "Delete")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Platform Fee Rules ────────────────────────────────────────────────────────
const pfSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean(),
  priority: z.coerce.number(),
  feeType: z.enum(["percent", "fixed", "hybrid"]),
  percentValue: z.coerce.number(),
  fixedAmount: z.coerce.number(),
  minFee: z.coerce.number().optional(),
  maxFee: z.coerce.number().optional(),
  targetScope: z.string(),
  countryCode: z.string().optional(),
  providerType: z.string().optional(),
  serviceCategory: z.string().optional(),
  modality: z.string().optional(),
});
type PfForm = z.infer<typeof pfSchema>;
const pfDefaults: PfForm = {
  name: "", description: "", enabled: true, priority: 100,
  feeType: "percent", percentValue: 3, fixedAmount: 0,
  minFee: undefined, maxFee: undefined, targetScope: "global",
  countryCode: "", providerType: "", serviceCategory: "", modality: "",
};

function PlatformFeeRulesPanel() {
  const tr = useRevenueCenterText();
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: rules = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/revenue/platform-fee-rules"] });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<{ id: string; name: string } | null>(null);

  const form = useForm<PfForm>({ resolver: zodResolver(pfSchema), defaultValues: pfDefaults });

  const saveMutation = useMutation({
    mutationFn: async (data: PfForm) => {
      const url = editingId ? `/api/admin/revenue/platform-fee-rules/${editingId}` : "/api/admin/revenue/platform-fee-rules";
      return (await apiRequest(editingId ? "PATCH" : "POST", url, data)).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue/platform-fee-rules"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue/overview"] });
      toast({ title: tr("saved", "Saved") }); setShowForm(false); setEditingId(null); form.reset(pfDefaults);
    },
    onError: (e: any) => toast({ title: tr("error", "Error"), description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/admin/revenue/platform-fee-rules/${id}`)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue/platform-fee-rules"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue/overview"] });
      toast({ title: tr("deleted", "Deleted") }); setDelTarget(null);
    },
  });

  function openEdit(r: any) {
    setEditingId(r.id);
    form.reset({
      name: r.name ?? "", description: r.description ?? "", enabled: r.enabled,
      priority: Number(r.priority), feeType: r.feeType ?? "percent",
      percentValue: Number(r.percentValue), fixedAmount: Number(r.fixedAmount),
      minFee: r.minFee != null ? Number(r.minFee) : undefined,
      maxFee: r.maxFee != null ? Number(r.maxFee) : undefined,
      targetScope: r.targetScope ?? "global",
      countryCode: r.countryCode ?? "", providerType: r.providerType ?? "",
      serviceCategory: r.serviceCategory ?? "", modality: r.modality ?? "",
    });
    setShowForm(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{tr("platform_fee_rules_title", "Platform Fee Rules")}</h3>
          <p className="text-sm text-muted-foreground">{tr("platform_fee_rules_description", "Percent, fixed, or hybrid fees with optional min/max caps")}</p>
        </div>
        <Button size="sm" onClick={() => { setEditingId(null); form.reset(pfDefaults); setShowForm(true); }} data-testid="button-add-platform-fee-rule">
          <Plus className="h-4 w-4 mr-1" />{tr("add_rule", "Add Rule")}
        </Button>
      </div>

      {isLoading ? <div className="h-24 flex items-center justify-center text-muted-foreground">{tr("loading", "Loading…")}</div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{tr("name", "Name")}</TableHead><TableHead>{tr("type", "Type")}</TableHead><TableHead>{tr("value", "Value")}</TableHead>
            <TableHead>{tr("scope", "Scope")}</TableHead><TableHead>{tr("priority", "Priority")}</TableHead><TableHead>{tr("status", "Status")}</TableHead><TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {rules.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{tr("no_rules_yet", "No rules yet.")}</TableCell></TableRow>}
            {rules.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}<br /><span className="text-xs text-muted-foreground">{r.description}</span></TableCell>
                <TableCell><Badge variant="secondary">{r.feeType}</Badge></TableCell>
                <TableCell>
                  {r.feeType === "percent" && fmtPct(r.percentValue)}
                  {r.feeType === "fixed" && fmt(r.fixedAmount)}
                  {r.feeType === "hybrid" && `${fmtPct(r.percentValue)} + ${fmt(r.fixedAmount)}`}
                  {(r.minFee || r.maxFee) && <span className="text-xs text-muted-foreground ml-1">[{r.minFee ? `min ${fmt(r.minFee)}` : ""}{r.maxFee ? ` max ${fmt(r.maxFee)}` : ""}]</span>}
                </TableCell>
                <TableCell><Badge variant="outline">{r.targetScope}{r.countryCode ? ` · ${r.countryCode}` : ""}</Badge></TableCell>
                <TableCell>{r.priority}</TableCell>
                <TableCell><StatusBadge enabled={r.enabled} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDelTarget({ id: r.id, name: r.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditingId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{tr(editingId ? "edit_platform_fee_rule" : "add_platform_fee_rule", editingId ? "Edit Platform Fee Rule" : "Add Platform Fee Rule")}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(d => saveMutation.mutate(d), () => toast({ title: tr("name_required", "Name is required"), variant: "destructive" }))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{tr("name_required_label", "Name *")}</Label>
                <Input {...form.register("name")} className={form.formState.errors.name ? "border-destructive" : ""} />
                {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{tr("name_required", "Name is required")}</p>}
              </div>
              <div className="col-span-2"><Label>{tr("description_label", "Description")}</Label><Input {...form.register("description")} /></div>
              <div>
                <Label>{tr("fee_type", "Fee Type")}</Label>
                <Select value={form.watch("feeType")} onValueChange={v => form.setValue("feeType", v as PfForm["feeType"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">{tr("percent", "Percent")}</SelectItem>
                    <SelectItem value="fixed">{tr("fixed", "Fixed")}</SelectItem>
                    <SelectItem value="hybrid">{tr("hybrid_percent_fixed", "Hybrid (% + Fixed)")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{tr("target_scope", "Target Scope")}</Label>
                <Select value={form.watch("targetScope")} onValueChange={v => form.setValue("targetScope", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">{tr("global", "Global")}</SelectItem>
                    <SelectItem value="country">{tr("country", "Country")}</SelectItem>
                    <SelectItem value="category">{tr("category", "Category")}</SelectItem>
                    <SelectItem value="provider_type">{tr("provider_type", "Provider Type")}</SelectItem>
                    <SelectItem value="modality">{tr("modality", "Modality")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(form.watch("feeType") !== "fixed") && <div><Label>{tr("percent_label", "Percent (%)")}</Label><Input type="number" step="0.01" {...form.register("percentValue")} /></div>}
              {(form.watch("feeType") !== "percent") && <div><Label>{tr("fixed_dollar", "Fixed ($)")}</Label><Input type="number" step="0.01" {...form.register("fixedAmount")} /></div>}
              <div><Label>{tr("min_fee", "Min Fee ($)")}</Label><Input type="number" step="0.01" {...form.register("minFee")} placeholder={tr("optional", "Optional")} /></div>
              <div><Label>{tr("max_fee", "Max Fee ($)")}</Label><Input type="number" step="0.01" {...form.register("maxFee")} placeholder={tr("optional", "Optional")} /></div>
              <div><Label>{tr("country_code", "Country Code")}</Label><Input {...form.register("countryCode")} placeholder={tr("country_code_placeholder", "HU, IR… (blank = all)")} /></div>
              <div><Label>{tr("priority", "Priority")}</Label><Input type="number" {...form.register("priority")} /></div>
              <div className="col-span-2 flex items-center gap-2"><Switch checked={form.watch("enabled")} onCheckedChange={v => form.setValue("enabled", v)} /><Label>{tr("enabled", "Enabled")}</Label></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{tr("cancel", "Cancel")}</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? tr("saving", "Saving…") : tr("save", "Save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        target={delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={() => delTarget && deleteMutation.mutate(delTarget.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Commission Rules ──────────────────────────────────────────────────────────
const crSchema = z.object({
  name: z.string().min(1), description: z.string().optional(),
  enabled: z.boolean(), priority: z.coerce.number(),
  commissionType: z.string(), commissionPercent: z.coerce.number(),
  fixedAmount: z.coerce.number(), providerId: z.string().optional(),
  providerType: z.string().optional(), serviceCategory: z.string().optional(),
  tier: z.string().optional(), countryCode: z.string().optional(),
});
type CrForm = z.infer<typeof crSchema>;
const crDefaults: CrForm = {
  name: "", description: "", enabled: true, priority: 100,
  commissionType: "global", commissionPercent: 10, fixedAmount: 0,
  providerId: "", providerType: "", serviceCategory: "", tier: "", countryCode: "",
};

function CommissionRulesPanel() {
  const tr = useRevenueCenterText();
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: rules = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/revenue/commission-rules"] });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<{ id: string; name: string } | null>(null);

  const form = useForm<CrForm>({ resolver: zodResolver(crSchema), defaultValues: crDefaults });

  const saveMutation = useMutation({
    mutationFn: async (data: CrForm) => {
      const url = editingId ? `/api/admin/revenue/commission-rules/${editingId}` : "/api/admin/revenue/commission-rules";
      return (await apiRequest(editingId ? "PATCH" : "POST", url, data)).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue/commission-rules"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue/overview"] });
      toast({ title: tr("saved", "Saved") }); setShowForm(false); setEditingId(null); form.reset(crDefaults);
    },
    onError: (e: any) => toast({ title: tr("error", "Error"), description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/admin/revenue/commission-rules/${id}`)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue/commission-rules"] });
      toast({ title: tr("deleted", "Deleted") }); setDelTarget(null);
    },
  });

  function openEdit(r: any) {
    setEditingId(r.id);
    form.reset({
      name: r.name ?? "", description: r.description ?? "", enabled: r.enabled,
      priority: Number(r.priority), commissionType: r.commissionType ?? "global",
      commissionPercent: Number(r.commissionPercent), fixedAmount: Number(r.fixedAmount),
      providerId: r.providerId ?? "", providerType: r.providerType ?? "",
      serviceCategory: r.serviceCategory ?? "", tier: r.tier ?? "", countryCode: r.countryCode ?? "",
    });
    setShowForm(true);
  }

  const CT_LABELS: Record<string, string> = {
    global: tr("global", "Global"), tier: tr("tier", "Tier"), provider_specific: tr("provider", "Provider"),
    category_specific: tr("category", "Category"), promotional: tr("promotional", "Promotional"),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h3 className="font-semibold">{tr("commission_rules_title", "Commission Rules")}</h3><p className="text-sm text-muted-foreground">{tr("commission_rules_description", "Provider commission rates — global, tier, provider, or category")}</p></div>
        <Button size="sm" onClick={() => { setEditingId(null); form.reset(crDefaults); setShowForm(true); }} data-testid="button-add-commission-rule"><Plus className="h-4 w-4 mr-1" />{tr("add_rule", "Add Rule")}</Button>
      </div>

      {isLoading ? <div className="h-24 flex items-center justify-center text-muted-foreground">{tr("loading", "Loading…")}</div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{tr("name", "Name")}</TableHead><TableHead>{tr("type", "Type")}</TableHead><TableHead>{tr("rate", "Rate")}</TableHead>
            <TableHead>{tr("scope", "Scope")}</TableHead><TableHead>{tr("priority", "Priority")}</TableHead><TableHead>{tr("status", "Status")}</TableHead><TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {rules.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{tr("no_commission_rules", "No rules. Default 10% seeded on first boot.")}</TableCell></TableRow>}
            {rules.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}<br /><span className="text-xs text-muted-foreground">{r.description}</span></TableCell>
                <TableCell><Badge variant="secondary">{CT_LABELS[r.commissionType] ?? r.commissionType}</Badge></TableCell>
                <TableCell className="font-mono">{fmtPct(r.commissionPercent)}{Number(r.fixedAmount) > 0 ? ` + ${fmt(r.fixedAmount)}` : ""}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.providerType ?? r.serviceCategory ?? r.providerId ?? "All"}{r.countryCode ? ` · ${r.countryCode}` : ""}</TableCell>
                <TableCell>{r.priority}</TableCell>
                <TableCell><StatusBadge enabled={r.enabled} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDelTarget({ id: r.id, name: r.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditingId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{tr(editingId ? "edit_commission_rule" : "add_commission_rule", editingId ? "Edit Commission Rule" : "Add Commission Rule")}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(d => saveMutation.mutate(d), () => toast({ title: tr("name_required", "Name is required"), variant: "destructive" }))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{tr("name_required_label", "Name *")}</Label>
                <Input {...form.register("name")} className={form.formState.errors.name ? "border-destructive" : ""} />
                {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{tr("name_required", "Name is required")}</p>}
              </div>
              <div className="col-span-2"><Label>{tr("description_label", "Description")}</Label><Input {...form.register("description")} /></div>
              <div>
                <Label>{tr("type", "Type")}</Label>
                <Select value={form.watch("commissionType")} onValueChange={v => form.setValue("commissionType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">{tr("global", "Global")}</SelectItem>
                    <SelectItem value="tier">{tr("provider_tier", "Provider Tier")}</SelectItem>
                    <SelectItem value="provider_specific">{tr("provider_specific", "Provider-Specific")}</SelectItem>
                    <SelectItem value="category_specific">{tr("category", "Category")}</SelectItem>
                    <SelectItem value="promotional">{tr("promotional", "Promotional")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{tr("commission_percent", "Commission %")}</Label><Input type="number" step="0.01" {...form.register("commissionPercent")} /></div>
              <div><Label>{tr("fixed_dollar", "Fixed ($)")}</Label><Input type="number" step="0.01" {...form.register("fixedAmount")} /></div>
              <div><Label>{tr("provider_type", "Provider Type")}</Label><Input {...form.register("providerType")} placeholder={tr("provider_type_placeholder", "physician, nursing, rehabilitation…")} /></div>
              <div><Label>{tr("category", "Category")}</Label><Input {...form.register("serviceCategory")} placeholder={tr("optional", "Optional")} /></div>
              <div><Label>{tr("country_code", "Country Code")}</Label><Input {...form.register("countryCode")} placeholder={tr("country_code_placeholder", "HU, IR… (blank = all)")} /></div>
              <div><Label>{tr("priority", "Priority")}</Label><Input type="number" {...form.register("priority")} /></div>
              <div className="col-span-2 flex items-center gap-2"><Switch checked={form.watch("enabled")} onCheckedChange={v => form.setValue("enabled", v)} /><Label>{tr("enabled", "Enabled")}</Label></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{tr("cancel", "Cancel")}</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? tr("saving", "Saving…") : tr("save", "Save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteDialog target={delTarget} onClose={() => setDelTarget(null)} onConfirm={() => delTarget && deleteMutation.mutate(delTarget.id)} isPending={deleteMutation.isPending} />
    </div>
  );
}

// ── Payment Method Rules ──────────────────────────────────────────────────────
function PaymentMethodRulesPanel() {
  const tr = useRevenueCenterText();
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: rules = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/revenue/payment-method-rules"] });
  const [editing, setEditing] = useState<any | null>(null);
  const [surchargeType, setSurchargeType] = useState("none");
  const [surchargeValue, setSurchargeValue] = useState("0");
  const [discountType, setDiscountType] = useState("none");
  const [discountValue, setDiscountValue] = useState("0");
  const [maintenance, setMaintenance] = useState(false);
  const [notes, setNotes] = useState("");

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) =>
      (await apiRequest("PATCH", `/api/admin/revenue/payment-method-rules/${id}`, { enabled })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/revenue/payment-method-rules"] }); toast({ title: tr("updated", "Updated") }); },
  });
  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { id, ...rest } = data as { id: string } & Record<string, unknown>;
      return (await apiRequest("PATCH", `/api/admin/revenue/payment-method-rules/${id}`, rest)).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/revenue/payment-method-rules"] }); toast({ title: tr("saved", "Saved") }); setEditing(null); },
  });

  function openEdit(r: any) {
    setEditing(r); setSurchargeType(r.surchargeType); setSurchargeValue(r.surchargeValue);
    setDiscountType(r.discountType); setDiscountValue(r.discountValue);
    setMaintenance(r.maintenanceMode); setNotes(r.notes ?? "");
  }

  return (
    <div className="space-y-4">
      <div><h3 className="font-semibold">{tr("payment_method_rules_title", "Payment Method Rules")}</h3><p className="text-sm text-muted-foreground">{tr("payment_method_rules_description", "Surcharges and discounts per payment method. Toggle availability and maintenance mode.")}</p></div>
      {isLoading ? <div className="h-24 flex items-center justify-center text-muted-foreground">{tr("loading", "Loading…")}</div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{tr("method", "Method")}</TableHead><TableHead>{tr("surcharge", "Surcharge")}</TableHead><TableHead>{tr("discount", "Discount")}</TableHead>
            <TableHead>{tr("status", "Status")}</TableHead><TableHead>{tr("active", "Active")}</TableHead><TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {rules.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.label}<br /><span className="text-xs font-mono text-muted-foreground">{r.paymentMethod}</span></TableCell>
                <TableCell>{r.surchargeType === "none" ? "—" : r.surchargeType === "percent" ? fmtPct(r.surchargeValue) : fmt(r.surchargeValue)}</TableCell>
                <TableCell>{r.discountType === "none" ? "—" : r.discountType === "percent" ? `-${fmtPct(r.discountValue)}` : `-${fmt(r.discountValue)}`}</TableCell>
                <TableCell><StatusBadge enabled={r.enabled} maintenanceMode={r.maintenanceMode} /></TableCell>
                <TableCell><Switch checked={r.enabled && !r.maintenanceMode} onCheckedChange={v => toggleMutation.mutate({ id: r.id, enabled: v })} data-testid={`switch-pm-${r.paymentMethod}`} /></TableCell>
                <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit {editing?.label}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{tr("surcharge_type", "Surcharge Type")}</Label>
                <Select value={surchargeType} onValueChange={setSurchargeType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">{tr("none", "None")}</SelectItem><SelectItem value="percent">{tr("percent", "Percent")}</SelectItem><SelectItem value="fixed">{tr("fixed", "Fixed")}</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>{tr("surcharge_value", "Surcharge Value")}</Label><Input type="number" step="0.01" value={surchargeValue} onChange={e => setSurchargeValue(e.target.value)} disabled={surchargeType === "none"} /></div>
              <div>
                <Label>{tr("discount_type", "Discount Type")}</Label>
                <Select value={discountType} onValueChange={setDiscountType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">{tr("none", "None")}</SelectItem><SelectItem value="percent">{tr("percent", "Percent")}</SelectItem><SelectItem value="fixed">{tr("fixed", "Fixed")}</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>{tr("discount_value", "Discount Value")}</Label><Input type="number" step="0.01" value={discountValue} onChange={e => setDiscountValue(e.target.value)} disabled={discountType === "none"} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={maintenance} onCheckedChange={setMaintenance} /><Label>{tr("maintenance_mode", "Maintenance Mode")}</Label></div>
            <div><Label>{tr("notes", "Notes")}</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{tr("cancel", "Cancel")}</Button>
            <Button onClick={() => editing && saveMutation.mutate({ id: editing.id, surchargeType, surchargeValue, discountType, discountValue, maintenanceMode: maintenance, notes })} disabled={saveMutation.isPending}>{tr("save", "Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Travel Fee Rules ──────────────────────────────────────────────────────────
const tfSchema = z.object({
  name: z.string().min(1), description: z.string().optional(),
  enabled: z.boolean(), priority: z.coerce.number(), feeType: z.string(),
  flatAmount: z.coerce.number(), perKmRate: z.coerce.number(),
  minDistanceKm: z.coerce.number().optional(), maxDistanceKm: z.coerce.number().optional(),
  radiusKm: z.coerce.number().optional(), countryCode: z.string().optional(), providerType: z.string().optional(),
});
type TfForm = z.infer<typeof tfSchema>;
const tfDefaults: TfForm = {
  name: "", description: "", enabled: true, priority: 100, feeType: "flat",
  flatAmount: 0, perKmRate: 0, minDistanceKm: undefined, maxDistanceKm: undefined,
  radiusKm: undefined, countryCode: "", providerType: "",
};

function TravelFeeRulesPanel() {
  const tr = useRevenueCenterText();
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: rules = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/revenue/travel-fee-rules"] });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<{ id: string; name: string } | null>(null);

  const form = useForm<TfForm>({ resolver: zodResolver(tfSchema), defaultValues: tfDefaults });

  const saveMutation = useMutation({
    mutationFn: async (data: TfForm) => {
      const url = editingId ? `/api/admin/revenue/travel-fee-rules/${editingId}` : "/api/admin/revenue/travel-fee-rules";
      return (await apiRequest(editingId ? "PATCH" : "POST", url, data)).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue/travel-fee-rules"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue/overview"] });
      toast({ title: tr("saved", "Saved") }); setShowForm(false); setEditingId(null); form.reset(tfDefaults);
    },
    onError: (e: any) => toast({ title: tr("error", "Error"), description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/admin/revenue/travel-fee-rules/${id}`)).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/revenue/travel-fee-rules"] }); toast({ title: tr("deleted", "Deleted") }); setDelTarget(null); },
  });

  function openEdit(r: any) {
    setEditingId(r.id);
    form.reset({ name: r.name ?? "", description: r.description ?? "", enabled: r.enabled, priority: Number(r.priority), feeType: r.feeType ?? "flat", flatAmount: Number(r.flatAmount), perKmRate: Number(r.perKmRate), radiusKm: r.radiusKm != null ? Number(r.radiusKm) : undefined, countryCode: r.countryCode ?? "", providerType: r.providerType ?? "" });
    setShowForm(true);
  }

  const FT_LABELS: Record<string, string> = { flat: tr("flat", "Flat"), distance: tr("per_km", "Per km"), zone: tr("zone", "Zone"), radius: tr("radius", "Radius"), provider_defined: tr("provider", "Provider"), platform_defined: tr("platform", "Platform") };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h3 className="font-semibold">{tr("travel_fee_rules_title", "Travel & Home Visit Fee Rules")}</h3><p className="text-sm text-muted-foreground">{tr("travel_fee_rules_description", "Flat, distance-based, zone, or radius fees for home visits")}</p></div>
        <Button size="sm" onClick={() => { setEditingId(null); form.reset(tfDefaults); setShowForm(true); }} data-testid="button-add-travel-rule"><Plus className="h-4 w-4 mr-1" />{tr("add_rule", "Add Rule")}</Button>
      </div>
      {isLoading ? <div className="h-24 flex items-center justify-center text-muted-foreground">{tr("loading", "Loading…")}</div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{tr("name", "Name")}</TableHead><TableHead>{tr("type", "Type")}</TableHead><TableHead>{tr("amount", "Amount")}</TableHead>
            <TableHead>{tr("scope", "Scope")}</TableHead><TableHead>{tr("priority", "Priority")}</TableHead><TableHead>{tr("status", "Status")}</TableHead><TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {rules.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{tr("no_travel_fee_rules", "No travel fee rules.")}</TableCell></TableRow>}
            {rules.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell><Badge variant="secondary">{FT_LABELS[r.feeType] ?? r.feeType}</Badge></TableCell>
                <TableCell>{r.feeType === "flat" ? fmt(r.flatAmount) : `${fmt(r.perKmRate)}/km`}</TableCell>
                <TableCell className="text-xs">{r.countryCode ?? "All"}{r.providerType ? ` · ${r.providerType}` : ""}</TableCell>
                <TableCell>{r.priority}</TableCell>
                <TableCell><StatusBadge enabled={r.enabled} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDelTarget({ id: r.id, name: r.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditingId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{tr(editingId ? "edit_travel_fee_rule" : "add_travel_fee_rule", editingId ? "Edit Travel Fee Rule" : "Add Travel Fee Rule")}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(d => saveMutation.mutate(d), () => toast({ title: tr("name_required", "Name is required"), variant: "destructive" }))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{tr("name_required_label", "Name *")}</Label>
                <Input {...form.register("name")} className={form.formState.errors.name ? "border-destructive" : ""} />
                {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{tr("name_required", "Name is required")}</p>}
              </div>
              <div>
                <Label>{tr("fee_type", "Fee Type")}</Label>
                <Select value={form.watch("feeType")} onValueChange={v => form.setValue("feeType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">{tr("flat_fee", "Flat Fee")}</SelectItem>
                    <SelectItem value="distance">{tr("per_km_upper", "Per KM")}</SelectItem>
                    <SelectItem value="radius">{tr("radius_description", "Radius (free zone + per km beyond)")}</SelectItem>
                    <SelectItem value="zone">{tr("zone", "Zone")}</SelectItem>
                    <SelectItem value="provider_defined">{tr("provider_defined", "Provider Defined")}</SelectItem>
                    <SelectItem value="platform_defined">{tr("platform_defined", "Platform Defined")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{tr("priority", "Priority")}</Label><Input type="number" {...form.register("priority")} /></div>
              <div><Label>{tr("flat_amount", "Flat Amount ($)")}</Label><Input type="number" step="0.01" {...form.register("flatAmount")} /></div>
              <div><Label>{tr("per_km_rate", "Per KM Rate ($)")}</Label><Input type="number" step="0.01" {...form.register("perKmRate")} /></div>
              <div><Label>{tr("free_radius", "Free Radius (km)")}</Label><Input type="number" step="0.1" {...form.register("radiusKm")} placeholder={tr("optional", "Optional")} /></div>
              <div><Label>{tr("country_code", "Country Code")}</Label><Input {...form.register("countryCode")} placeholder={tr("country_code_placeholder", "HU, IR… (blank = all)")} /></div>
              <div className="col-span-2 flex items-center gap-2"><Switch checked={form.watch("enabled")} onCheckedChange={v => form.setValue("enabled", v)} /><Label>{tr("enabled", "Enabled")}</Label></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{tr("cancel", "Cancel")}</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? tr("saving", "Saving…") : tr("save", "Save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DeleteDialog target={delTarget} onClose={() => setDelTarget(null)} onConfirm={() => delTarget && deleteMutation.mutate(delTarget.id)} isPending={deleteMutation.isPending} />
    </div>
  );
}

// ── Payout Config ─────────────────────────────────────────────────────────────
const pcSchema = z.object({
  name: z.string().min(1), description: z.string().optional(),
  enabled: z.boolean(), schedule: z.string(),
  reservePercent: z.coerce.number(), holdbackPercent: z.coerce.number(),
  refundProtectionPercent: z.coerce.number(), minPayoutAmount: z.coerce.number(),
  maxPayoutAmount: z.coerce.number().optional(),
  countryCode: z.string().optional(), providerType: z.string().optional(),
});
type PcForm = z.infer<typeof pcSchema>;
const pcDefaults: PcForm = {
  name: "", description: "", enabled: true, schedule: "weekly",
  reservePercent: 0, holdbackPercent: 0, refundProtectionPercent: 5,
  minPayoutAmount: 10, maxPayoutAmount: undefined, countryCode: "", providerType: "",
};

function PayoutConfigPanel() {
  const tr = useRevenueCenterText();
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: configs = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/revenue/payout-config"] });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<{ id: string; name: string } | null>(null);

  const form = useForm<PcForm>({ resolver: zodResolver(pcSchema), defaultValues: pcDefaults });

  const saveMutation = useMutation({
    mutationFn: async (data: PcForm) => {
      const url = editingId ? `/api/admin/revenue/payout-config/${editingId}` : "/api/admin/revenue/payout-config";
      return (await apiRequest(editingId ? "PATCH" : "POST", url, data)).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue/payout-config"] });
      toast({ title: tr("saved", "Saved") }); setShowForm(false); setEditingId(null); form.reset(pcDefaults);
    },
    onError: (e: any) => toast({ title: tr("error", "Error"), description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/admin/revenue/payout-config/${id}`)).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/revenue/payout-config"] }); toast({ title: tr("deleted", "Deleted") }); setDelTarget(null); },
  });

  function openEdit(c: any) {
    setEditingId(c.id);
    form.reset({
      name: c.name ?? "", description: c.description ?? "", enabled: c.enabled, schedule: c.schedule ?? "weekly",
      reservePercent: Number(c.reservePercent), holdbackPercent: Number(c.holdbackPercent),
      refundProtectionPercent: Number(c.refundProtectionPercent), minPayoutAmount: Number(c.minPayoutAmount),
      maxPayoutAmount: c.maxPayoutAmount != null ? Number(c.maxPayoutAmount) : undefined,
      countryCode: c.countryCode ?? "", providerType: c.providerType ?? "",
    });
    setShowForm(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h3 className="font-semibold">{tr("payout_configuration_title", "Payout Configuration")}</h3><p className="text-sm text-muted-foreground">{tr("payout_configuration_description", "Payout schedules, reserve %, holdback %, and refund protection")}</p></div>
        <Button size="sm" onClick={() => { setEditingId(null); form.reset(pcDefaults); setShowForm(true); }} data-testid="button-add-payout-config"><Plus className="h-4 w-4 mr-1" />{tr("add_config", "Add Config")}</Button>
      </div>
      {isLoading ? <div className="h-24 flex items-center justify-center text-muted-foreground">{tr("loading", "Loading…")}</div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{tr("name", "Name")}</TableHead><TableHead>{tr("schedule", "Schedule")}</TableHead><TableHead>{tr("reserve", "Reserve")}</TableHead>
            <TableHead>{tr("holdback", "Holdback")}</TableHead><TableHead>{tr("refund_protect", "Refund Protect")}</TableHead><TableHead>{tr("min_payout", "Min Payout")}</TableHead><TableHead>{tr("status", "Status")}</TableHead><TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {configs.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{tr("no_payout_configs", "No configs. Default seeded on first boot.")}</TableCell></TableRow>}
            {configs.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}<br /><span className="text-xs text-muted-foreground">{c.countryCode ? c.countryCode : "Global"}{c.providerType ? ` · ${c.providerType}` : ""}</span></TableCell>
                <TableCell><Badge variant="secondary">{c.schedule}</Badge></TableCell>
                <TableCell>{fmtPct(c.reservePercent)}</TableCell>
                <TableCell>{fmtPct(c.holdbackPercent)}</TableCell>
                <TableCell>{fmtPct(c.refundProtectionPercent)}</TableCell>
                <TableCell>{fmt(c.minPayoutAmount)}</TableCell>
                <TableCell><StatusBadge enabled={c.enabled} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDelTarget({ id: c.id, name: c.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditingId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{tr(editingId ? "edit_payout_config" : "add_payout_config", editingId ? "Edit Payout Config" : "Add Payout Config")}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(d => saveMutation.mutate(d), () => toast({ title: tr("name_required", "Name is required"), variant: "destructive" }))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{tr("name_required_label", "Name *")}</Label>
                <Input {...form.register("name")} className={form.formState.errors.name ? "border-destructive" : ""} />
                {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{tr("name_required", "Name is required")}</p>}
              </div>
              <div>
                <Label>{tr("schedule", "Schedule")}</Label>
                <Select value={form.watch("schedule")} onValueChange={v => form.setValue("schedule", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instant">{tr("instant", "Instant")}</SelectItem>
                    <SelectItem value="manual">{tr("manual", "Manual")}</SelectItem>
                    <SelectItem value="weekly">{tr("weekly", "Weekly")}</SelectItem>
                    <SelectItem value="biweekly">{tr("biweekly", "Biweekly")}</SelectItem>
                    <SelectItem value="monthly">{tr("monthly", "Monthly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{tr("min_payout_dollar", "Min Payout ($)")}</Label><Input type="number" step="0.01" {...form.register("minPayoutAmount")} /></div>
              <div><Label>{tr("reserve_percent", "Reserve %")}</Label><Input type="number" step="0.01" {...form.register("reservePercent")} /></div>
              <div><Label>{tr("holdback_percent", "Holdback %")}</Label><Input type="number" step="0.01" {...form.register("holdbackPercent")} /></div>
              <div><Label>{tr("refund_protection_percent", "Refund Protection %")}</Label><Input type="number" step="0.01" {...form.register("refundProtectionPercent")} /></div>
              <div><Label>{tr("max_payout_dollar", "Max Payout ($)")}</Label><Input type="number" step="0.01" {...form.register("maxPayoutAmount")} placeholder={tr("optional", "Optional")} /></div>
              <div><Label>{tr("country_code", "Country Code")}</Label><Input {...form.register("countryCode")} placeholder={tr("country_code_placeholder", "HU, IR… (blank = all)")} /></div>
              <div><Label>{tr("provider_type", "Provider Type")}</Label><Input {...form.register("providerType")} placeholder={tr("optional", "Optional")} /></div>
              <div className="col-span-2 flex items-center gap-2"><Switch checked={form.watch("enabled")} onCheckedChange={v => form.setValue("enabled", v)} /><Label>{tr("enabled", "Enabled")}</Label></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{tr("cancel", "Cancel")}</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? tr("saving", "Saving…") : tr("save", "Save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DeleteDialog target={delTarget} onClose={() => setDelTarget(null)} onConfirm={() => delTarget && deleteMutation.mutate(delTarget.id)} isPending={deleteMutation.isPending} />
    </div>
  );
}

// ── Revenue Share Rules ───────────────────────────────────────────────────────
const rsSchema = z.object({
  name: z.string().min(1), description: z.string().optional(),
  enabled: z.boolean(), priority: z.coerce.number(),
  participantType: z.string(), sharePercent: z.coerce.number(),
  fixedAmount: z.coerce.number(), countryCode: z.string().optional(),
  providerType: z.string().optional(), serviceCategory: z.string().optional(),
});
type RsForm = z.infer<typeof rsSchema>;
const rsDefaults: RsForm = {
  name: "", description: "", enabled: true, priority: 100,
  participantType: "platform", sharePercent: 0, fixedAmount: 0,
  countryCode: "", providerType: "", serviceCategory: "",
};

function RevenueSharePanel() {
  const qc = useQueryClient(); const { toast } = useToast();
  const tr = useRevenueCenterText();
  const { data: rules = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/revenue/share-rules"] });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<{ id: string; name: string } | null>(null);

  const form = useForm<RsForm>({ resolver: zodResolver(rsSchema), defaultValues: rsDefaults });

  const saveMutation = useMutation({
    mutationFn: async (data: RsForm) => {
      const url = editingId ? `/api/admin/revenue/share-rules/${editingId}` : "/api/admin/revenue/share-rules";
      return (await apiRequest(editingId ? "PATCH" : "POST", url, data)).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue/share-rules"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue/overview"] });
      toast({ title: tr("saved", "Saved") }); setShowForm(false); setEditingId(null); form.reset(rsDefaults);
    },
    onError: (e: any) => toast({ title: tr("error", "Error"), description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/admin/revenue/share-rules/${id}`)).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/revenue/share-rules"] }); toast({ title: tr("deleted", "Deleted") }); setDelTarget(null); },
  });

  function openEdit(r: any) {
    setEditingId(r.id);
    form.reset({ name: r.name ?? "", description: r.description ?? "", enabled: r.enabled, priority: Number(r.priority), participantType: r.participantType ?? "platform", sharePercent: Number(r.sharePercent), fixedAmount: Number(r.fixedAmount), countryCode: r.countryCode ?? "", providerType: r.providerType ?? "", serviceCategory: r.serviceCategory ?? "" });
    setShowForm(true);
  }

  const PT_LABELS: Record<string, string> = {
    provider: tr("provider", "Provider"), clinic: tr("clinic", "Clinic"), franchise: tr("franchise", "Franchise"),
    partner: tr("partner", "Partner"), referral_partner: tr("referral_partner", "Referral Partner"),
    platform: tr("goldenlife_platform", "GoldenLife (Platform)"),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h3 className="font-semibold">{tr("revenue_sharing_rules", "Revenue Sharing Rules")}</h3><p className="text-sm text-muted-foreground">{tr("revenue_sharing_desc", "Split revenue among providers, clinics, partners, and the platform")}</p></div>
        <Button size="sm" onClick={() => { setEditingId(null); form.reset(rsDefaults); setShowForm(true); }} data-testid="button-add-share-rule"><Plus className="h-4 w-4 mr-1" />{tr("add_rule", "Add Rule")}</Button>
      </div>
      {isLoading ? <div className="h-24 flex items-center justify-center text-muted-foreground">{tr("loading", "Loading…")}</div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{tr("name", "Name")}</TableHead><TableHead>{tr("participant", "Participant")}</TableHead><TableHead>{tr("share_percent", "Share %")}</TableHead>
            <TableHead>{tr("fixed", "Fixed")}</TableHead><TableHead>{tr("scope", "Scope")}</TableHead><TableHead>{tr("status", "Status")}</TableHead><TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {rules.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{tr("no_revenue_share_rules", "No revenue share rules configured.")}</TableCell></TableRow>}
            {rules.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell><Badge variant="secondary">{PT_LABELS[r.participantType] ?? r.participantType}</Badge></TableCell>
                <TableCell>{fmtPct(r.sharePercent)}</TableCell>
                <TableCell>{Number(r.fixedAmount) > 0 ? fmt(r.fixedAmount) : "—"}</TableCell>
                <TableCell className="text-xs">{r.countryCode ?? tr("global", "Global")}</TableCell>
                <TableCell><StatusBadge enabled={r.enabled} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDelTarget({ id: r.id, name: r.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditingId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? tr("edit", "Edit") : tr("add", "Add")} {tr("revenue_sharing_rules", "Revenue Share Rule")}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(d => saveMutation.mutate(d), () => toast({ title: tr("name_required", "Name is required"), variant: "destructive" }))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{tr("name", "Name")} *</Label>
                <Input {...form.register("name")} className={form.formState.errors.name ? "border-destructive" : ""} />
                {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{tr("name_required", "Name is required")}</p>}
              </div>
              <div>
                <Label>{tr("participant_type", "Participant Type")}</Label>
                <Select value={form.watch("participantType")} onValueChange={v => form.setValue("participantType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="provider">{tr("provider", "Provider")}</SelectItem>
                    <SelectItem value="clinic">{tr("clinic", "Clinic")}</SelectItem>
                    <SelectItem value="franchise">{tr("franchise", "Franchise")}</SelectItem>
                    <SelectItem value="partner">{tr("partner", "Partner")}</SelectItem>
                    <SelectItem value="referral_partner">{tr("referral_partner", "Referral Partner")}</SelectItem>
                    <SelectItem value="platform">{tr("goldenlife_platform", "GoldenLife (Platform)")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{tr("share_percent", "Share %")}</Label><Input type="number" step="0.01" {...form.register("sharePercent")} /></div>
              <div><Label>{tr("fixed_amount", "Fixed Amount ($)")}</Label><Input type="number" step="0.01" {...form.register("fixedAmount")} /></div>
              <div><Label>{tr("priority", "Priority")}</Label><Input type="number" {...form.register("priority")} /></div>
              <div><Label>{tr("country_code", "Country Code")}</Label><Input {...form.register("countryCode")} placeholder={tr("country_code_placeholder", "HU, IR… (blank = all)")} /></div>
              <div className="col-span-2 flex items-center gap-2"><Switch checked={form.watch("enabled")} onCheckedChange={v => form.setValue("enabled", v)} /><Label>{tr("enabled", "Enabled")}</Label></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{tr("cancel", "Cancel")}</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? tr("saving", "Saving…") : tr("save", "Save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DeleteDialog target={delTarget} onClose={() => setDelTarget(null)} onConfirm={() => delTarget && deleteMutation.mutate(delTarget.id)} isPending={deleteMutation.isPending} />
    </div>
  );
}

// ── Wallet Rules ──────────────────────────────────────────────────────────────
function WalletRulesPanel() {
  const qc = useQueryClient(); const { toast } = useToast();
  const tr = useRevenueCenterText();
  const { data: rules = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/revenue/wallet-rules"] });
  const [editing, setEditing] = useState<any | null>(null);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editMaxBalance, setEditMaxBalance] = useState("");
  const [editExpiryDays, setEditExpiryDays] = useState("");
  const [editCanPromo, setEditCanPromo] = useState(true);
  const [editCanMembership, setEditCanMembership] = useState(true);
  const [editNotes, setEditNotes] = useState("");

  const saveMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      (await apiRequest("PATCH", `/api/admin/revenue/wallet-rules/${id}`, data)).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/revenue/wallet-rules"] }); toast({ title: tr("saved", "Saved") }); setEditing(null); },
  });

  function openEdit(r: any) {
    setEditing(r); setEditEnabled(r.enabled); setEditMaxBalance(r.maxBalanceUsd ?? "");
    setEditExpiryDays(r.expiryDays ? String(r.expiryDays) : "");
    setEditCanPromo(r.canCombineWithPromo); setEditCanMembership(r.canCombineWithMembership);
    setEditNotes(r.notes ?? "");
  }

  return (
    <div className="space-y-4">
      <div><h3 className="font-semibold">{tr("wallet_rules", "Wallet Rules")}</h3><p className="text-sm text-muted-foreground">{tr("wallet_rules_desc", "Usage rules for each credit type — balance limits, expiry, stacking")}</p></div>
      {isLoading ? <div className="h-24 flex items-center justify-center text-muted-foreground">{tr("loading", "Loading…")}</div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{tr("credit_type", "Credit Type")}</TableHead><TableHead>{tr("max_balance", "Max Balance")}</TableHead><TableHead>{tr("expiry", "Expiry")}</TableHead>
            <TableHead>{tr("combine_promo", "Combine w/ Promo")}</TableHead><TableHead>{tr("combine_membership", "Combine w/ Membership")}</TableHead><TableHead>{tr("status", "Status")}</TableHead><TableHead className="w-20" />
          </TableRow></TableHeader>
          <TableBody>
            {rules.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.label}<br /><span className="text-xs font-mono text-muted-foreground">{r.creditType}</span></TableCell>
                <TableCell>{r.maxBalanceUsd ? fmt(r.maxBalanceUsd) : tr("unlimited", "Unlimited")}</TableCell>
                <TableCell>{r.expiryDays ? `${r.expiryDays}d` : tr("never", "Never")}</TableCell>
                <TableCell>{r.canCombineWithPromo ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
                <TableCell>{r.canCombineWithMembership ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
                <TableCell><StatusBadge enabled={r.enabled} /></TableCell>
                <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{tr("edit", "Edit")} {editing?.label}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{tr("max_balance", "Max Balance")} ($)</Label><Input type="number" step="0.01" value={editMaxBalance} onChange={e => setEditMaxBalance(e.target.value)} placeholder={tr("unlimited", "Unlimited")} /></div>
              <div><Label>{tr("expiry_days", "Expiry (days)")}</Label><Input type="number" value={editExpiryDays} onChange={e => setEditExpiryDays(e.target.value)} placeholder={tr("never", "Never")} /></div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2"><Switch checked={editCanPromo} onCheckedChange={setEditCanPromo} /><Label>{tr("can_combine_promo", "Can combine with promo codes")}</Label></div>
              <div className="flex items-center gap-2"><Switch checked={editCanMembership} onCheckedChange={setEditCanMembership} /><Label>{tr("can_combine_membership", "Can combine with memberships")}</Label></div>
              <div className="flex items-center gap-2"><Switch checked={editEnabled} onCheckedChange={setEditEnabled} /><Label>{tr("enabled", "Enabled")}</Label></div>
            </div>
            <div><Label>{tr("notes", "Notes")}</Label><Input value={editNotes} onChange={e => setEditNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{tr("cancel", "Cancel")}</Button>
            <Button onClick={() => editing && saveMutation.mutate({ id: editing.id, enabled: editEnabled, maxBalanceUsd: editMaxBalance || undefined, expiryDays: editExpiryDays ? Number(editExpiryDays) : undefined, canCombineWithPromo: editCanPromo, canCombineWithMembership: editCanMembership, notes: editNotes })} disabled={saveMutation.isPending}>{tr("save", "Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Revenue Simulator ─────────────────────────────────────────────────────────

interface SimResult {
  base: number; platformFee: number; visitTypeFee: number; surge: number;
  emergencyFee: number; tax: number; discount: number; membershipDiscount: number;
  total: number; paymentSurcharge: number; engineTravelFee: number;
  patientPayable: number; platformRevenue: number; providerEarnings: number;
  commissionRate: number; commissionAmount: number;
  bookingCurrency: string; finalTotalUsd: number;
  revenueShares: { participantType: string; label: string; amount: number; percent: number }[];
  appliedRules: { ruleType: string; ruleName: string; impact: string }[];
  lines: { label: string; amount: number }[];
}

interface RulesSummary {
  commissionRules: any[];
  platformFeeRules: any[];
  paymentMethodRules: any[];
  travelFeeRules: any[];
  revenueShareRules: any[];
}

const SIM_CURRENCIES = [
  { code: "USD", label: "USD — US Dollar",       symbol: "$"  },
  { code: "EUR", label: "EUR — Euro",             symbol: "€"  },
  { code: "GBP", label: "GBP — British Pound",    symbol: "£"  },
  { code: "HUF", label: "HUF — Hungarian Forint", symbol: "Ft" },
  { code: "IRR", label: "IRR — Iranian Rial",     symbol: "﷼"  },
];

const PROVIDER_TYPES = [
  { value: "physician",            label: "Physician"           },
  { value: "mental_health",        label: "Mental Health"       },
  { value: "rehabilitation",       label: "Rehabilitation"      },
  { value: "nursing",              label: "Nursing"             },
  { value: "dental",               label: "Dental"              },
  { value: "nutrition",            label: "Nutrition"           },
  { value: "alternative_medicine", label: "Alternative Medicine"},
];

const PAYMENT_METHODS = [
  { value: "cash",          label: "Cash"              },
  { value: "card",          label: "Credit/Debit Card" },
  { value: "wallet",        label: "Wallet Credits"    },
  { value: "bank_transfer", label: "Bank Transfer"     },
  { value: "stripe",        label: "Stripe"            },
  { value: "paypal",        label: "PayPal"            },
  { value: "apple_pay",     label: "Apple Pay"         },
  { value: "google_pay",    label: "Google Pay"        },
  { value: "crypto",        label: "Crypto"            },
];

function currFmt(amount: number, code: string): string {
  return formatInCurrency(amount, code);
}

function SimSection({ label, icon: Icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 border-b pb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      {children}
    </div>
  );
}

function SimField({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={span2 ? "col-span-2" : undefined}>
      <Label className="text-xs mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

function RulePill({ name, value, highlight }: { name: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      "flex items-center justify-between rounded px-2 py-1 text-xs",
      highlight ? "bg-primary/10 border border-primary/20" : "bg-muted/50"
    )}>
      <span className={cn("truncate max-w-[160px]", highlight && "font-medium text-primary")} title={name}>{name}</span>
      <span className="font-mono shrink-0 ml-2 text-muted-foreground">{value}</span>
    </div>
  );
}

function RevenueSimulatorPanel() {
  const { toast } = useToast();
  const tr = useRevenueCenterText();

  // ── Booking context ──────────────────────────────────────────────────────
  const [currency,        setCurrency]        = useState("USD");
  const [countryCode,     setCountryCode]     = useState("any");
  const [providerType,    setProviderType]    = useState("none");
  const [serviceCategory, setServiceCategory] = useState("");

  // ── Pricing ──────────────────────────────────────────────────────────────
  const [basePrice,       setBasePrice]       = useState("100");
  const [sessions,        setSessions]        = useState("1");
  const [visitType,       setVisitType]       = useState("clinic");
  const [isEmergency,     setIsEmergency]     = useState(false);
  const [surgeMultiplier, setSurgeMultiplier] = useState("1");

  // ── Service-level fee overrides ──────────────────────────────────────────
  const [homeVisitFee,        setHomeVisitFee]        = useState("0");
  const [clinicFee,           setClinicFee]           = useState("0");
  const [telemedicineFee,     setTelemedicineFee]     = useState("0");
  const [emergencyFee,        setEmergencyFee]        = useState("0");
  const [platformFeeOverride, setPlatformFeeOverride] = useState("");

  // ── Payment & travel ─────────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [travelKm,      setTravelKm]      = useState("0");

  // ── Discounts ────────────────────────────────────────────────────────────
  const [promoType,              setPromoType]              = useState("none");
  const [promoValue,             setPromoValue]             = useState("0");
  const [promoCode,              setPromoCode]              = useState("");
  const [membershipSvcPct,       setMembershipSvcPct]       = useState("0");
  const [membershipPlatformPct,  setMembershipPlatformPct]  = useState("0");
  const [membershipCommRedPct,   setMembershipCommRedPct]   = useState("0");

  // ── Results ──────────────────────────────────────────────────────────────
  const [result, setResult] = useState<SimResult | null>(null);

  const { data: ratesData } = useQuery<Record<string, number>>({
    queryKey: ["/api/exchange-rates"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: rulesSummary, isLoading: rulesLoading, refetch: refetchRules } =
    useQuery<RulesSummary>({
      queryKey: ["/api/admin/revenue/rules-summary"],
      staleTime: 0,
    });

  const activeCommission  = rulesSummary?.commissionRules?.filter((r: any) => r.enabled)    ?? [];
  const activePlatformFee = rulesSummary?.platformFeeRules?.filter((r: any) => r.enabled)   ?? [];
  const activePayment     = rulesSummary?.paymentMethodRules?.filter((r: any) => r.enabled && !r.maintenanceMode) ?? [];
  const activeTravelFee   = rulesSummary?.travelFeeRules?.filter((r: any) => r.enabled)     ?? [];
  const activeRevShare    = rulesSummary?.revenueShareRules?.filter((r: any) => r.enabled)  ?? [];

  const sym = SIM_CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;

  const simMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/revenue/simulate", {
        basePrice:                   Number(basePrice),
        bookingCurrency:             currency,
        sessions:                    Number(sessions),
        visitType,
        paymentMethod,
        countryCode:                 countryCode !== "any" ? countryCode : undefined,
        providerType:                providerType !== "none" ? providerType : undefined,
        serviceCategory:             serviceCategory || undefined,
        isEmergency,
        surgeMultiplier:             Number(surgeMultiplier),
        travelDistanceKm:            visitType === "home" ? (Number(travelKm) || undefined) : undefined,
        homeVisitFee:                Number(homeVisitFee),
        clinicFee:                   Number(clinicFee),
        telemedicineFee:             Number(telemedicineFee),
        emergencyFee:                Number(emergencyFee),
        platformFeeOverride:         platformFeeOverride !== "" ? Number(platformFeeOverride) : undefined,
        promoDiscountType:           promoType !== "none" ? promoType : undefined,
        promoDiscountValue:          promoType !== "none" ? Number(promoValue) : undefined,
        promoCode:                   promoType !== "none" && promoCode ? promoCode : undefined,
        membershipServiceDiscountPct:     Number(membershipSvcPct),
        membershipPlatformFeeDiscountPct: Number(membershipPlatformPct),
        membershipReducedCommissionPct:   Number(membershipCommRedPct),
        rates:                       ratesData ?? undefined,
      });
      return res.json() as Promise<SimResult>;
    },
    onSuccess: (data) => setResult(data),
    onError: (e: any) => toast({ title: tr("simulation_error", "Simulation error"), description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-primary" />Live Revenue Simulator</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Uses your real admin-configured rules — no hardcoded values. Every result reflects what the booking engine would actually charge.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetchRules()} disabled={rulesLoading} data-testid="button-reload-rules">
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", rulesLoading && "animate-spin")} />Reload Rules
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr_1fr] gap-4 items-start">

        {/* ── Column 1: Inputs ─────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Booking Context */}
          <Card><CardContent className="pt-4 space-y-4">
            <SimSection label="Booking Context" icon={Target}>
              <div className="grid grid-cols-2 gap-2">
                <SimField label="Currency" span2>
                  <Select value={currency} onValueChange={v => { setCurrency(v); setResult(null); }}>
                    <SelectTrigger data-testid="select-sim-currency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SIM_CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </SimField>
                <SimField label="Country">
                  <Select value={countryCode} onValueChange={setCountryCode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any / Global</SelectItem>
                      <SelectItem value="HU">HU — Hungary</SelectItem>
                      <SelectItem value="IR">IR — Iran</SelectItem>
                      <SelectItem value="US">US — United States</SelectItem>
                      <SelectItem value="DE">DE — Germany</SelectItem>
                      <SelectItem value="GB">GB — United Kingdom</SelectItem>
                    </SelectContent>
                  </Select>
                </SimField>
                <SimField label="Provider Type">
                  <Select value={providerType} onValueChange={setProviderType}>
                    <SelectTrigger data-testid="select-sim-provider-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any / None</SelectItem>
                      {PROVIDER_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </SimField>
                <SimField label="Service Category" span2>
                  <Input value={serviceCategory} onChange={e => setServiceCategory(e.target.value)} placeholder="e.g. physiotherapy, cardiology…" className="text-sm" data-testid="input-sim-service-category" />
                </SimField>
              </div>
            </SimSection>
          </CardContent></Card>

          {/* Pricing */}
          <Card><CardContent className="pt-4 space-y-4">
            <SimSection label="Pricing" icon={DollarSign}>
              <div className="grid grid-cols-2 gap-2">
                <SimField label={`Base Price (${sym})`} span2>
                  <Input type="number" step="0.01" value={basePrice} onChange={e => setBasePrice(e.target.value)} className="text-sm font-mono" data-testid="input-sim-base-price" />
                </SimField>
                <SimField label="Sessions">
                  <Input type="number" min="1" step="1" value={sessions} onChange={e => setSessions(e.target.value)} className="text-sm" data-testid="input-sim-sessions" />
                </SimField>
                <SimField label="Visit Type">
                  <Select value={visitType} onValueChange={v => { setVisitType(v); setResult(null); }}>
                    <SelectTrigger data-testid="select-sim-visit-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clinic">Clinic</SelectItem>
                      <SelectItem value="home">Home Visit</SelectItem>
                      <SelectItem value="online">Online / Video</SelectItem>
                    </SelectContent>
                  </Select>
                </SimField>
                <SimField label="Surge Multiplier">
                  <Input type="number" step="0.1" min="1" value={surgeMultiplier} onChange={e => setSurgeMultiplier(e.target.value)} className="text-sm" data-testid="input-sim-surge" />
                </SimField>
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <Switch checked={isEmergency} onCheckedChange={setIsEmergency} data-testid="switch-sim-emergency" />
                  <Label className="text-sm cursor-pointer">Emergency appointment</Label>
                </div>
              </div>
            </SimSection>
          </CardContent></Card>

          {/* Service-level fee overrides */}
          <Card><CardContent className="pt-4 space-y-4">
            <SimSection label="Service Fee Overrides" icon={Receipt}>
              <p className="text-xs text-muted-foreground -mt-2">These mimic per-service configured fees. Leave 0 if the service uses defaults.</p>
              <div className="grid grid-cols-2 gap-2">
                <SimField label={`Home Visit (${sym})`}><Input type="number" step="0.01" value={homeVisitFee} onChange={e => setHomeVisitFee(e.target.value)} disabled={visitType !== "home"} className="text-sm font-mono" /></SimField>
                <SimField label={`Clinic (${sym})`}><Input type="number" step="0.01" value={clinicFee} onChange={e => setClinicFee(e.target.value)} disabled={visitType !== "clinic"} className="text-sm font-mono" /></SimField>
                <SimField label={`Telemedicine (${sym})`}><Input type="number" step="0.01" value={telemedicineFee} onChange={e => setTelemedicineFee(e.target.value)} disabled={visitType !== "online"} className="text-sm font-mono" /></SimField>
                <SimField label={`Emergency (${sym})`}><Input type="number" step="0.01" value={emergencyFee} onChange={e => setEmergencyFee(e.target.value)} disabled={!isEmergency} className="text-sm font-mono" /></SimField>
                <SimField label={`Platform Override (${sym})`} span2>
                  <Input type="number" step="0.01" value={platformFeeOverride} onChange={e => setPlatformFeeOverride(e.target.value)} placeholder="Blank = use platform fee rules" className="text-sm font-mono" data-testid="input-sim-platform-override" />
                </SimField>
              </div>
            </SimSection>
          </CardContent></Card>

          {/* Payment & Travel */}
          <Card><CardContent className="pt-4 space-y-4">
            <SimSection label="Payment & Travel" icon={CreditCard}>
              <div className="grid grid-cols-2 gap-2">
                <SimField label="Payment Method" span2>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger data-testid="select-sim-payment"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </SimField>
                <SimField label="Travel Distance (km)" span2>
                  <Input type="number" step="0.5" value={travelKm} onChange={e => setTravelKm(e.target.value)} disabled={visitType !== "home"} className="text-sm" placeholder="0 = no travel charge" data-testid="input-sim-travel-km" />
                </SimField>
              </div>
            </SimSection>
          </CardContent></Card>

          {/* Discounts & Membership */}
          <Card><CardContent className="pt-4 space-y-4">
            <SimSection label="Discounts & Membership" icon={Percent}>
              <div className="grid grid-cols-2 gap-2">
                <SimField label="Promo Type">
                  <Select value={promoType} onValueChange={setPromoType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="percent">Percent (%)</SelectItem>
                      <SelectItem value="fixed">{tr("fixed_amount_option", "Fixed Amount")}</SelectItem>
                    </SelectContent>
                  </Select>
                </SimField>
                <SimField label="Promo Value">
                  <Input type="number" step="0.01" value={promoValue} onChange={e => setPromoValue(e.target.value)} disabled={promoType === "none"} className="text-sm" />
                </SimField>
                <SimField label="Promo Code (label)" span2>
                  <Input value={promoCode} onChange={e => setPromoCode(e.target.value)} disabled={promoType === "none"} placeholder="CODE10" className="text-sm" />
                </SimField>
                <div className="col-span-2 text-xs text-muted-foreground border-t pt-2">Membership benefits applied to this booking:</div>
                <SimField label="Service Discount (%)">
                  <Input type="number" step="1" min="0" max="100" value={membershipSvcPct} onChange={e => setMembershipSvcPct(e.target.value)} className="text-sm" />
                </SimField>
                <SimField label="Platform Fee Off (%)">
                  <Input type="number" step="1" min="0" max="100" value={membershipPlatformPct} onChange={e => setMembershipPlatformPct(e.target.value)} className="text-sm" />
                </SimField>
                <SimField label="Commission Reduction (pts)" span2>
                  <Input type="number" step="1" min="0" value={membershipCommRedPct} onChange={e => setMembershipCommRedPct(e.target.value)} placeholder="Pts subtracted from commission rate" className="text-sm" data-testid="input-sim-membership-comm-red" />
                </SimField>
              </div>
            </SimSection>
          </CardContent></Card>

          <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
            {tr("tax_notice", "Tax is resolved from the active canonical service and platform rules for the selected country.")}
          </div>

          <Button className="w-full" size="lg" onClick={() => simMutation.mutate()} disabled={simMutation.isPending} data-testid="button-run-simulation">
            {simMutation.isPending
              ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Simulating…</>
              : <><Zap className="h-4 w-4 mr-2" />Run Live Simulation</>}
          </Button>
        </div>

        {/* ── Column 2: Live Active Rules ──────────────────────────────────── */}
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Live Active Rules
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Exactly what the engine will use — pulled directly from your admin config.
              {rulesLoading && <span className="ml-1 text-amber-500">Refreshing…</span>}
            </p>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">

            {/* Commission */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Commission</span>
                <Badge variant={activeCommission.length > 0 ? "default" : "secondary"} className="text-[10px] ml-auto py-0">
                  {activeCommission.length} active
                </Badge>
              </div>
              {activeCommission.length === 0 ? (
                <div className="flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-md p-2 border border-amber-200/50">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  No commission rules — engine charges 0%
                </div>
              ) : (
                <div className="space-y-1">
                  {activeCommission.map((r: any) => (
                    <RulePill key={r.id}
                      name={`${r.name}${r.providerType ? ` [${r.providerType}]` : ""}${r.countryCode ? ` (${r.countryCode})` : ""}`}
                      value={`${r.commissionPercent}%`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Platform Fees */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Platform Fees</span>
                <Badge variant={activePlatformFee.length > 0 ? "default" : "secondary"} className="text-[10px] ml-auto py-0">
                  {activePlatformFee.length} active
                </Badge>
              </div>
              {activePlatformFee.length === 0 ? (
                <div className="flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-md p-2 border border-amber-200/50">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  No platform fee rules — uses service-level fee only
                </div>
              ) : (
                <div className="space-y-1">
                  {activePlatformFee.map((r: any) => (
                    <RulePill key={r.id}
                      name={`${r.name} (${r.targetScope})`}
                      value={r.feeType === "percent" ? `${r.percentValue}%` : formatInCurrency(Number(r.fixedAmount), "USD")}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Payment Methods */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Payment Methods</span>
                <Badge variant={activePayment.length > 0 ? "default" : "secondary"} className="text-[10px] ml-auto py-0">
                  {activePayment.length} active
                </Badge>
              </div>
              <div className="space-y-1">
                {activePayment.map((r: any) => {
                  const surcharge = r.surchargeType === "percent" && r.surchargeValue > 0
                    ? `+${r.surchargeValue}%`
                    : r.surchargeType === "fixed" && r.surchargeValue > 0
                    ? `+$${r.surchargeValue}`
                    : null;
                  const discount = r.discountType === "percent" && r.discountValue > 0
                    ? `-${r.discountValue}%`
                    : r.discountType === "fixed" && r.discountValue > 0
                    ? `-$${r.discountValue}`
                    : null;
                  return (
                    <RulePill key={r.id}
                      name={r.label}
                      value={surcharge ?? discount ?? "no adj."}
                      highlight={r.paymentMethod === paymentMethod}
                    />
                  );
                })}
                {activePayment.length === 0 && <p className="text-xs text-muted-foreground">No payment rules active</p>}
              </div>
            </div>

            {/* Travel Fees */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Car className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Travel Fees</span>
                <Badge variant={activeTravelFee.length > 0 ? "default" : "secondary"} className="text-[10px] ml-auto py-0">
                  {activeTravelFee.length} active
                </Badge>
              </div>
              {activeTravelFee.length === 0 ? (
                <p className="text-xs text-muted-foreground">No travel fee rules — distance charges disabled</p>
              ) : (
                <div className="space-y-1">
                  {activeTravelFee.map((r: any) => (
                    <RulePill key={r.id}
                      name={r.name}
                      value={r.perKmRate > 0 ? `${r.perKmRate}/km` : r.baseFee > 0 ? `base $${r.baseFee}` : "—"}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Revenue Shares */}
            {activeRevShare.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Revenue Shares</span>
                  <Badge variant="default" className="text-[10px] ml-auto py-0">{activeRevShare.length} active</Badge>
                </div>
                <div className="space-y-1">
                  {activeRevShare.map((r: any) => (
                    <RulePill key={r.id} name={r.name} value={`${r.sharePercent}%`} />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Column 3: Results ────────────────────────────────────────────── */}
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Simulation Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Zap className="h-10 w-10 opacity-15" />
                <div className="text-center">
                  <p className="text-sm font-medium">No results yet</p>
                  <p className="text-xs opacity-70 mt-1">Configure the inputs and click "Run Live Simulation"</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Currency tag */}
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">{result.bookingCurrency}</Badge>
                  {result.bookingCurrency !== "USD" && (
                    <span className="text-xs text-muted-foreground">≈ {formatInCurrency(result.finalTotalUsd, "USD")}</span>
                  )}
                </div>

                {/* 3-card summary */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-2.5 text-center">
                    <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide">Member Pays</p>
                    <p className="text-base font-bold text-blue-700 mt-0.5 font-mono leading-tight">{currFmt(result.patientPayable, result.bookingCurrency)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-2.5 text-center">
                    <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">Provider Earns</p>
                    <p className="text-base font-bold text-emerald-700 mt-0.5 font-mono leading-tight">{currFmt(result.providerEarnings, result.bookingCurrency)}</p>
                  </div>
                  <div className="rounded-lg bg-violet-50 dark:bg-violet-900/20 p-2.5 text-center">
                    <p className="text-[10px] text-violet-600 font-semibold uppercase tracking-wide">Platform</p>
                    <p className="text-base font-bold text-violet-700 mt-0.5 font-mono leading-tight">{currFmt(result.platformRevenue, result.bookingCurrency)}</p>
                  </div>
                </div>

                {/* Full breakdown */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Breakdown</div>
                  <div className="px-3 py-2 space-y-1 text-sm">
                    {result.lines.map((l, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-muted-foreground">{l.label}</span>
                        <span className={cn("font-mono font-medium",
                          l.amount < 0 ? "text-emerald-600" : l.amount === 0 ? "text-muted-foreground" : ""
                        )}>
                          {l.amount < 0 ? "−" : ""}{currFmt(Math.abs(l.amount), result.bookingCurrency)}
                        </span>
                      </div>
                    ))}
                    {result.paymentSurcharge !== 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Payment surcharge</span>
                        <span className={cn("font-mono font-medium", result.paymentSurcharge > 0 ? "text-red-600" : "text-emerald-600")}>
                          {result.paymentSurcharge > 0 ? "+" : "−"}{currFmt(Math.abs(result.paymentSurcharge), result.bookingCurrency)}
                        </span>
                      </div>
                    )}
                    {result.engineTravelFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Travel fee</span>
                        <span className="font-mono font-medium text-red-600">+{currFmt(result.engineTravelFee, result.bookingCurrency)}</span>
                      </div>
                    )}
                    <div className="border-t pt-1.5 mt-1 flex justify-between font-semibold">
                      <span>Total Payable</span>
                      <span className="font-mono">{currFmt(result.patientPayable, result.bookingCurrency)}</span>
                    </div>
                  </div>
                </div>

                {/* Commission */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Commission</div>
                  <div className="px-3 py-2 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span className="font-mono">{result.commissionRate}%</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount deducted</span><span className="font-mono text-red-600">−{currFmt(result.commissionAmount, result.bookingCurrency)}</span></div>
                    <div className="flex justify-between font-medium border-t pt-1 mt-0.5"><span>Provider net</span><span className="font-mono text-emerald-600">{currFmt(result.providerEarnings, result.bookingCurrency)}</span></div>
                  </div>
                </div>

                {/* Revenue shares */}
                {result.revenueShares.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Revenue Split</div>
                    <div className="px-3 py-2 space-y-1 text-sm">
                      {result.revenueShares.map((s, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-muted-foreground">{s.label}</span>
                          <span className="font-mono">{currFmt(s.amount, result.bookingCurrency)} <span className="text-muted-foreground text-xs">({s.percent}%)</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Applied rules audit / no-rules warning */}
                {result.appliedRules.length === 0 ? (
                  <div className="flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 rounded-lg p-3">
                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-700">No rules matched this scenario</p>
                      <p className="text-muted-foreground mt-0.5">Results use only base price + service fees. Add commission and platform fee rules in their respective tabs to see rule-driven output.</p>
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Rules That Fired ({result.appliedRules.length})
                    </div>
                    <div className="px-3 py-2 space-y-2">
                      {result.appliedRules.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <Badge variant="outline" className="text-[10px] shrink-0 capitalize mt-0.5">
                            {r.ruleType.replace(/_/g, " ")}
                          </Badge>
                          <div>
                            <span className="font-medium">{r.ruleName}</span>
                            <span className="text-muted-foreground ml-1">— {r.impact}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

// ── Canonical tax rule management ─────────────────────────────────────────────
function TaxSettingsPanel() {
  const { toast } = useToast();
  const tr = useRevenueCenterText();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ serviceRules: any[]; platformRules: any[] }>({
    queryKey: ["/api/admin/tax-rules"],
  });
  const { data: subServices = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/sub-services"],
  });
  const [editingPlatform, setEditingPlatform] = useState<any | null>(null);
  const [editingService, setEditingService] = useState<any | null>(null);
  const platformForm = useForm<any>({
    defaultValues: {
      countryCode: "", taxName: "VAT", taxRate: 0, year: new Date().getFullYear(),
      effectiveFrom: "", effectiveTo: "", isActive: true,
    },
  });
  const serviceForm = useForm<any>({
    defaultValues: {
      subServiceId: "", countryCode: "", taxRate: 0,
      effectiveFrom: "", effectiveTo: "", isActive: true,
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/admin/tax-rules"] });
  const savePlatform = useMutation({
    mutationFn: (vals: any) => apiRequest(
      editingPlatform?.id ? "PATCH" : "POST",
      editingPlatform?.id ? `/api/admin/tax-rules/platform/${editingPlatform.id}` : "/api/admin/tax-rules/platform",
      vals,
    ),
    onSuccess: () => { toast({ title: tr("saved", "Saved") }); invalidate(); setEditingPlatform(null); },
    onError: () => toast({ title: tr("save_failed", "Save failed"), variant: "destructive" }),
  });
  const saveService = useMutation({
    mutationFn: (vals: any) => apiRequest(
      editingService?.id ? "PATCH" : "POST",
      editingService?.id ? `/api/admin/tax-rules/service/${editingService.id}` : "/api/admin/tax-rules/service",
      vals,
    ),
    onSuccess: () => { toast({ title: tr("saved", "Saved") }); invalidate(); setEditingService(null); },
    onError: () => toast({ title: tr("save_failed", "Save failed"), variant: "destructive" }),
  });
  const deleteRule = useMutation({
    mutationFn: ({ kind, id }: { kind: "platform" | "service"; id: string }) =>
      apiRequest("DELETE", `/api/admin/tax-rules/${kind}/${id}`),
    onSuccess: () => { toast({ title: tr("deleted", "Deleted") }); invalidate(); },
    onError: () => toast({ title: tr("delete_failed", "Delete failed"), variant: "destructive" }),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground p-4">{tr("tax_rules_loading", "Loading canonical tax rules…")}</p>;
  const platformRules = data?.platformRules ?? [];
  const serviceRules = data?.serviceRules ?? [];
  const beginPlatform = (rule?: any) => {
    platformForm.reset(rule ? {
      countryCode: rule.countryCode, taxName: rule.taxName || "VAT",
      taxRate: Number(rule.taxRate || 0), year: rule.year || new Date().getFullYear(),
      effectiveFrom: rule.effectiveFrom ? String(rule.effectiveFrom).slice(0, 16) : "",
      effectiveTo: rule.effectiveTo ? String(rule.effectiveTo).slice(0, 16) : "",
      isActive: rule.isActive !== false,
    } : undefined);
    setEditingPlatform(rule || {});
  };
  const beginService = (rule?: any) => {
    serviceForm.reset(rule ? {
      subServiceId: rule.subServiceId, countryCode: rule.countryCode,
      taxRate: Number(rule.taxRate || 0),
      effectiveFrom: rule.effectiveFrom ? String(rule.effectiveFrom).slice(0, 16) : "",
      effectiveTo: rule.effectiveTo ? String(rule.effectiveTo).slice(0, 16) : "",
      isActive: rule.isActive !== false,
    } : undefined);
    setEditingService(rule || {});
  };
  return (
    <div className="space-y-6">
      <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
        {tr("tax_rules_notice", "Tax is resolved only from these country-specific canonical rules. The legacy sub-service tax percentage is not used.")}
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> {tr("platform_tax_rules", "Platform tax / VAT rules")}</CardTitle>
          <Button size="sm" onClick={() => beginPlatform()} data-testid="btn-add-platform-tax-rule"><Plus className="h-4 w-4 mr-1" />{tr("add_tax_rule", "Add rule")}</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader><TableRow><TableHead>{tr("country", "Country")}</TableHead><TableHead>{tr("name", "Name")}</TableHead><TableHead>{tr("rate", "Rate")}</TableHead><TableHead>{tr("effective", "Effective")}</TableHead><TableHead>{tr("active", "Active")}</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {platformRules.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.country}</TableCell>
                  <TableCell>{r.taxName || "VAT"}</TableCell>
                  <TableCell>{Number(r.taxRate || 0)}%</TableCell>
                  <TableCell className="text-xs">{r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString() : "Now"}{r.effectiveTo ? ` – ${new Date(r.effectiveTo).toLocaleDateString()}` : ""}</TableCell>
                  <TableCell>{r.isActive ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => beginPlatform(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteRule.mutate({ kind: "platform", id: r.id })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {!platformRules.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-sm">{tr("no_platform_tax_rules", "No platform tax rules configured")}</TableCell></TableRow>}
            </TableBody>
          </Table>
          {editingPlatform !== null && (
            <Card className="bg-muted/20"><CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><Label>{tr("country_code_short", "Country code")}</Label><Input {...platformForm.register("countryCode")} placeholder="HU / IR" /></div>
                <div><Label>Tax name</Label><Input {...platformForm.register("taxName")} placeholder="VAT" /></div>
                <div><Label>Rate (%)</Label><Input type="number" min="0" max="100" step="0.01" {...platformForm.register("taxRate", { valueAsNumber: true })} /></div>
                <div><Label>Year</Label><Input type="number" {...platformForm.register("year", { valueAsNumber: true })} /></div>
                <div><Label>{tr("effective_from", "Effective from")}</Label><Input type="datetime-local" {...platformForm.register("effectiveFrom")} /></div>
                <div><Label>{tr("effective_to", "Effective to")}</Label><Input type="datetime-local" {...platformForm.register("effectiveTo")} /></div>
                <label className="flex items-center gap-2 pt-6 text-sm"><Switch checked={platformForm.watch("isActive")} onCheckedChange={v => platformForm.setValue("isActive", v)} />Active</label>
              </div>
              <div className="flex gap-2"><Button size="sm" onClick={platformForm.handleSubmit(v => savePlatform.mutate(v))} disabled={savePlatform.isPending}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditingPlatform(null)}>Cancel</Button></div>
            </CardContent></Card>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><Percent className="h-4 w-4" /> {tr("subservice_tax_rules", "Sub-service tax rules")}</CardTitle>
          <Button size="sm" onClick={() => beginService()} data-testid="btn-add-service-tax-rule"><Plus className="h-4 w-4 mr-1" />{tr("add_tax_rule", "Add rule")}</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader><TableRow><TableHead>{tr("subservice", "Sub-service")}</TableHead><TableHead>{tr("country", "Country")}</TableHead><TableHead>{tr("rate", "Rate")}</TableHead><TableHead>{tr("effective", "Effective")}</TableHead><TableHead>{tr("active", "Active")}</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {serviceRules.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.subServiceName || r.subServiceId}</TableCell>
                  <TableCell className="font-mono text-xs">{r.countryCode}</TableCell>
                  <TableCell>{Number(r.taxRate || 0)}%</TableCell>
                  <TableCell className="text-xs">{r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString() : "Now"}{r.effectiveTo ? ` – ${new Date(r.effectiveTo).toLocaleDateString()}` : ""}</TableCell>
                  <TableCell>{r.isActive ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => beginService(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteRule.mutate({ kind: "service", id: r.id })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {!serviceRules.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-sm">{tr("no_subservice_tax_rules", "No sub-service tax rules configured")}</TableCell></TableRow>}
            </TableBody>
          </Table>
          {editingService !== null && (
            <Card className="bg-muted/20"><CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2"><Label>{tr("subservice", "Sub-service")}</Label><Select value={serviceForm.watch("subServiceId") || ""} onValueChange={v => serviceForm.setValue("subServiceId", v)} disabled={!!editingService?.id}><SelectTrigger><SelectValue placeholder={tr("select_subservice", "Select sub-service")} /></SelectTrigger><SelectContent>{subServices.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>{tr("country_code_short", "Country code")}</Label><Input {...serviceForm.register("countryCode")} placeholder="HU / IR" /></div>
                <div><Label>Rate (%)</Label><Input type="number" min="0" max="100" step="0.01" {...serviceForm.register("taxRate", { valueAsNumber: true })} /></div>
                <div><Label>{tr("effective_from", "Effective from")}</Label><Input type="datetime-local" {...serviceForm.register("effectiveFrom")} /></div>
                <div><Label>{tr("effective_to", "Effective to")}</Label><Input type="datetime-local" {...serviceForm.register("effectiveTo")} /></div>
                <label className="flex items-center gap-2 pt-6 text-sm"><Switch checked={serviceForm.watch("isActive")} onCheckedChange={v => serviceForm.setValue("isActive", v)} />{tr("active", "Active")}</label>
              </div>
              <div className="flex gap-2"><Button size="sm" onClick={serviceForm.handleSubmit(v => saveService.mutate(v))} disabled={saveService.isPending}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditingService(null)}>Cancel</Button></div>
            </CardContent></Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── W5/W9: Gift Cards Admin Panel ─────────────────────────────────────────────
function GiftCardsAdminPanel() {
  const { toast } = useToast();
  const tr = useRevenueCenterText();
  const qc = useQueryClient();
  const { data: cards = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/gift-cards"] });
  const [issuing, setIssuing] = useState(false);
  const form = useForm<any>({ defaultValues: { amount: 50, recipientEmail: "", currency: "USD", daysValid: 365 } });
  const issueMut = useMutation({
    mutationFn: (vals: any) => apiRequest("POST", "/api/admin/gift-cards/issue", vals),
    onSuccess: () => { toast({ title: tr("gift_card_issued", "Gift card issued") }); qc.invalidateQueries({ queryKey: ["/api/admin/gift-cards"] }); setIssuing(false); },
    onError: () => toast({ title: tr("issue_failed", "Issue failed"), variant: "destructive" }),
  });
  const deactivateMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/gift-cards/${id}/deactivate`),
    onSuccess: () => { toast({ title: tr("gift_card_deactivated", "Gift card deactivated") }); qc.invalidateQueries({ queryKey: ["/api/admin/gift-cards"] }); },
    onError: () => toast({ title: tr("error", "Error"), variant: "destructive" }),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground p-4">{tr("loading", "Loading…")}</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2"><Gift className="h-4 w-4" /> {tr("tab_gift_cards", "Gift Cards")}</h3>
        <Button size="sm" onClick={() => setIssuing(true)} data-testid="btn-issue-gift-card"><Plus className="h-4 w-4 mr-1" />{tr("issue_card", "Issue Card")}</Button>
      </div>
      {issuing && (
        <Card><CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{tr("amount", "Amount")}</Label><Input type="number" {...form.register("amount", { valueAsNumber: true })} data-testid="input-gc-amount" /></div>
            <div><Label>{tr("currency", "Currency")}</Label><Input {...form.register("currency")} data-testid="input-gc-currency" /></div>
            <div><Label>{tr("recipient_email", "Recipient Email")}</Label><Input {...form.register("recipientEmail")} data-testid="input-gc-email" /></div>
            <div><Label>{tr("valid_days", "Valid Days")}</Label><Input type="number" {...form.register("daysValid", { valueAsNumber: true })} data-testid="input-gc-days" /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={form.handleSubmit(vals => issueMut.mutate(vals))} disabled={issueMut.isPending} data-testid="btn-confirm-issue-gc">{tr("issue", "Issue")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setIssuing(false)}>{tr("cancel", "Cancel")}</Button>
          </div>
        </CardContent></Card>
      )}
      <Table>
        <TableHeader><TableRow><TableHead>{tr("code", "Code")}</TableHead><TableHead>{tr("balance", "Balance")}</TableHead><TableHead>{tr("issued_to", "Issued To")}</TableHead><TableHead>{tr("expires", "Expires")}</TableHead><TableHead>{tr("active", "Active")}</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(cards as any[]).map((c: any) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs">{c.code}</TableCell>
              <TableCell>{formatInCurrency(Number(c.balance), c.currency as string)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{c.recipient_email ?? c.purchaser_email ?? "—"}</TableCell>
              <TableCell className="text-xs">{c.expires_at ? formatDate(c.expires_at) : tr("no_expiry", "No expiry")}</TableCell>
              <TableCell>{c.is_active ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
              <TableCell>
                {c.is_active && <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => deactivateMut.mutate(c.id)} data-testid={`btn-deactivate-gc-${c.id}`}>{tr("deactivate", "Deactivate")}</Button>}
              </TableCell>
            </TableRow>
          ))}
          {cards.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-sm">{tr("no_gift_cards", "No gift cards issued")}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

export function RevenueBillingCenter() {
  const { t } = useTranslation();
  const sections = [
    { value: "overview",        label: t("admin.revenue_center.tab_overview", "Overview"),         icon: BarChart3,  component: <OverviewPanel /> },
    { value: "platform-fees",   label: t("admin.revenue_center.tab_platform_fees", "Platform Fees"),    icon: Percent,    component: <PlatformFeeRulesPanel /> },
    { value: "commissions",     label: t("admin.revenue_center.tab_commissions", "Commissions"),      icon: TrendingUp, component: <CommissionRulesPanel /> },
    { value: "payment-rules",   label: t("admin.revenue_center.tab_payment_rules", "Payment Rules"),    icon: CreditCard, component: <PaymentMethodRulesPanel /> },
    { value: "travel-fees",     label: t("admin.revenue_center.tab_travel_fees", "Travel Fees"),      icon: Car,        component: <TravelFeeRulesPanel /> },
    { value: "payout-rules",    label: t("admin.revenue_center.tab_payout_rules", "Payout Rules"),     icon: Clock,      component: <PayoutConfigPanel /> },
    { value: "revenue-sharing", label: t("admin.revenue_center.tab_revenue_sharing", "Revenue Sharing"),  icon: Users,      component: <RevenueSharePanel /> },
    { value: "wallet-rules",    label: t("admin.revenue_center.tab_wallet_rules", "Wallet Rules"),     icon: Wallet,     component: <WalletRulesPanel /> },
    { value: "simulator",       label: t("admin.revenue_center.tab_simulator", "Simulator"),        icon: Play,       component: <RevenueSimulatorPanel /> },
    { value: "tax-settings",    label: t("admin.revenue_center.tab_tax_settings", "Tax / VAT"),        icon: Receipt,    component: <TaxSettingsPanel /> },
    { value: "gift-cards",      label: t("admin.revenue_center.tab_gift_cards", "Gift Cards"),       icon: Gift,       component: <GiftCardsAdminPanel /> },
    {
      value: "invoices",
      label: t("admin.revenue_center.tab_invoices", "Invoices"),
      icon: FileText,
      component: <Suspense fallback={<PanelLoader />}><LazyInvoiceManagement /></Suspense>,
    },
    {
      value: "patient-wallets",
      label: t("admin.revenue_center.tab_patient_wallets", "Member Wallets"),
      icon: Wallet,
      component: <Suspense fallback={<PanelLoader />}><LazyAdminWallets /></Suspense>,
    },
    {
      value: "payouts",
      label: t("admin.revenue_center.tab_payouts", "Payouts"),
      icon: Banknote,
      component: <Suspense fallback={<PanelLoader />}><LazyAdminPayoutsPanel /></Suspense>,
    },
    {
      value: "provider-wallets",
      label: t("admin.revenue_center.tab_provider_wallets", "Provider Wallets"),
      icon: Building2,
      component: <Suspense fallback={<PanelLoader />}><LazyAdminProviderWalletsPanel /></Suspense>,
    },
    {
      value: "promo-codes",
      label: t("admin.revenue_center.tab_promo_codes", "Promo Codes"),
      icon: Tag,
      component: <Suspense fallback={<PanelLoader />}><LazyPromoCodeManagement /></Suspense>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Layers className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">{t("admin.revenue_center.title", "Revenue & Billing Center")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.revenue_center.description", "Unified control panel — pricing rules, fees, commissions, payment surcharges, travel fees, payouts, and revenue sharing. No hardcoded values.")}
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex h-9 gap-0.5 bg-muted rounded-lg p-1 min-w-max">
            {sections.map(s => (
              <TabsTrigger key={s.value} value={s.value} className="flex items-center gap-1.5 text-xs px-3 h-7 whitespace-nowrap" data-testid={`tab-revenue-${s.value}`}>
                <s.icon className="h-3.5 w-3.5 shrink-0" />
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {sections.map(s => (
          <TabsContent key={s.value} value={s.value} className="mt-4">
            {s.component}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
