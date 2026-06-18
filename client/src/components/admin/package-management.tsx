import { useState, useMemo, useEffect } from "react";
import { useAdminCurrency } from "@/lib/currency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Copy, Users, Globe, MapPin, CheckCircle, XCircle, ShoppingBag, Star, Zap, Shield, Percent, Archive, ArchiveRestore, AlertTriangle, SquareCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PackageBenefit {
  id?: string;
  packageId?: string;
  benefitKey: string;
  benefitValue: string;
  notes?: string | null;
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
  maxPurchases: number | null;
  sortOrder: number;
  createdAt: string;
  benefits: PackageBenefit[];
  purchaseCount?: number;
}

interface UserPurchase {
  id: string;
  user_id: string;
  package_id: string;
  status: string;
  price_paid: string;
  purchased_at: string;
  activated_at: string | null;
  expires_at: string | null;
  package_name: string;
  user_name: string;
  email: string;
}

// ── Benefit config ─────────────────────────────────────────────────────────────

const BENEFIT_KEYS = [
  { key: "service_discount_percent", label: "Service Discount (%)", unit: "%", icon: Percent, description: "% off the base service price on each booking" },
  { key: "platform_fee_discount",    label: "Platform Fee Discount (%)", unit: "%", icon: Percent, description: "% off the platform fee on each booking" },
  { key: "wallet_bonus",             label: "Wallet Bonus (on activation)", unit: "curr", icon: Zap, description: "Amount added to wallet when package activates" },
  { key: "featured_provider",        label: "Featured Listing (months)", unit: "mo", icon: Star, description: "Months of featured listing for providers" },
  { key: "reduced_commission",       label: "Commission Reduction (%)", unit: "%", icon: Percent, description: "Provider commission reduction percentage" },
  { key: "priority_support",         label: "Priority Support", unit: "bool", icon: Shield, description: "1 = enabled, 0 = disabled" },
  { key: "free_cancellations",       label: "Free Cancellations", unit: "count", icon: CheckCircle, description: "Number of free cancellations per month" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active:    "bg-green-50 text-green-700",
    pending:   "bg-yellow-50 text-yellow-700",
    expired:   "bg-muted/50 text-muted-foreground",
    cancelled: "bg-red-50 text-red-700",
  };
  return <Badge variant="outline" className={`text-xs ${map[status] ?? ""}`}>{status}</Badge>;
}

// ── Benefit editor row ─────────────────────────────────────────────────────────

function BenefitRow({
  benefit,
  onChange,
  onRemove,
}: {
  benefit: PackageBenefit;
  onChange: (b: PackageBenefit) => void;
  onRemove: () => void;
}) {
  const meta = BENEFIT_KEYS.find(b => b.key === benefit.benefitKey);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={benefit.benefitKey} onValueChange={v => onChange({ ...benefit, benefitKey: v })}>
        <SelectTrigger className="w-56 text-xs">
          <SelectValue placeholder="Benefit type" />
        </SelectTrigger>
        <SelectContent>
          {BENEFIT_KEYS.map(b => (
            <SelectItem key={b.key} value={b.key} className="text-xs">{b.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min="0"
          className="w-24 text-xs"
          value={benefit.benefitValue}
          onChange={e => onChange({ ...benefit, benefitValue: e.target.value })}
          placeholder="Value"
          data-testid="input-benefit-value"
        />
        {meta && <span className="text-xs text-muted-foreground">{meta.unit}</span>}
      </div>
      <Input
        className="flex-1 min-w-32 text-xs"
        value={benefit.notes ?? ""}
        onChange={e => onChange({ ...benefit, notes: e.target.value })}
        placeholder="Notes (optional)"
        data-testid="input-benefit-notes"
      />
      <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove} data-testid="button-remove-benefit">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── Package form ───────────────────────────────────────────────────────────────

type PackageFormData = {
  name: string;
  description: string;
  countryCode: string;
  durationDays: number;
  price: string;
  currency: string;
  targetUserType: string;
  isActive: boolean;
  maxPurchases: string;
  sortOrder: number;
  benefits: PackageBenefit[];
};

const DEFAULT_FORM: PackageFormData = {
  name: "", description: "", countryCode: "", durationDays: 30, price: "0.00",
  currency: "USD", targetUserType: "patient", isActive: true, maxPurchases: "",
  sortOrder: 0, benefits: [],
};

function PackageFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: PkgData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<PackageFormData>(() =>
    initial
      ? {
          name: initial.name,
          description: initial.description ?? "",
          countryCode: initial.countryCode ?? "",
          durationDays: initial.durationDays,
          price: String(initial.price),
          currency: initial.currency,
          targetUserType: initial.targetUserType,
          isActive: initial.isActive,
          maxPurchases: initial.maxPurchases != null ? String(initial.maxPurchases) : "",
          sortOrder: initial.sortOrder,
          benefits: initial.benefits.map(b => ({ ...b })),
        }
      : { ...DEFAULT_FORM },
  );
  const [loading, setLoading] = useState(false);

  function setField<K extends keyof PackageFormData>(k: K, v: PackageFormData[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }

  function addBenefit() {
    setField("benefits", [
      ...form.benefits,
      { benefitKey: "service_discount_percent", benefitValue: "0", notes: null },
    ]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast({ title: "Package name is required", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        countryCode: form.countryCode || null,
        maxPurchases: form.maxPurchases ? Number(form.maxPurchases) : null,
        benefits: form.benefits.map(b => ({
          benefitKey: b.benefitKey,
          benefitValue: b.benefitValue,
          notes: b.notes ?? null,
        })),
      };
      if (initial) {
        await apiRequest("PATCH", `/api/admin/packages/${initial.id}`, payload);
        toast({ title: "Package updated" });
      } else {
        await apiRequest("POST", "/api/admin/packages", payload);
        toast({ title: "Package created" });
      }
      qc.invalidateQueries({ queryKey: ["/api/admin/packages"] });
      onSaved();
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to save package", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-package-form">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Package" : "Create Package"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Package Name *</Label>
              <Input data-testid="input-pkg-name" value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. Premium Care Plan" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Description</Label>
              <Textarea data-testid="input-pkg-desc" value={form.description} onChange={e => setField("description", e.target.value)} placeholder="What does this package offer?" rows={2} />
            </div>
            <div className="space-y-1">
              <Label>Price</Label>
              <Input data-testid="input-pkg-price" type="number" min="0" step="0.01" value={form.price} onChange={e => setField("price", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setField("currency", v)}>
                <SelectTrigger data-testid="select-pkg-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="HUF">HUF</SelectItem>
                  <SelectItem value="IRR">IRR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Duration (days)</Label>
              <Input data-testid="input-pkg-duration" type="number" min="1" value={form.durationDays} onChange={e => setField("durationDays", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Target User</Label>
              <Select value={form.targetUserType} onValueChange={v => setField("targetUserType", v)}>
                <SelectTrigger data-testid="select-pkg-target"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="patient">Clients</SelectItem>
                  <SelectItem value="provider">Providers</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Country Scope</Label>
              <Select value={form.countryCode || "__global__"} onValueChange={v => setField("countryCode", v === "__global__" ? "" : v)}>
                <SelectTrigger data-testid="select-pkg-country"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__global__">Global (all countries)</SelectItem>
                  <SelectItem value="HU">Hungary (HU)</SelectItem>
                  <SelectItem value="IR">Iran (IR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Max Purchases (leave blank = unlimited)</Label>
              <Input data-testid="input-pkg-max" type="number" min="1" value={form.maxPurchases} onChange={e => setField("maxPurchases", e.target.value)} placeholder="Unlimited" />
            </div>
            <div className="space-y-1">
              <Label>Sort Order</Label>
              <Input data-testid="input-pkg-sort" type="number" value={form.sortOrder} onChange={e => setField("sortOrder", Number(e.target.value))} />
            </div>
            <div className="flex items-center gap-2 pt-4">
              <Switch
                checked={form.isActive}
                onCheckedChange={v => setField("isActive", v)}
                data-testid="switch-pkg-active"
              />
              <Label>Active</Label>
            </div>
          </div>

          {/* Benefits */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Benefits</Label>
              <Button type="button" size="sm" variant="outline" onClick={addBenefit} data-testid="button-add-benefit">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Benefit
              </Button>
            </div>
            {form.benefits.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No benefits added yet.</p>
            )}
            <div className="space-y-2">
              {form.benefits.map((b, i) => (
                <BenefitRow
                  key={i}
                  benefit={b}
                  onChange={updated => {
                    const arr = [...form.benefits];
                    arr[i] = updated;
                    setField("benefits", arr);
                  }}
                  onRemove={() => setField("benefits", form.benefits.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} data-testid="button-save-package">
              {loading ? "Saving…" : initial ? "Save Changes" : "Create Package"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PackageManagement() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { format: fmtMoney } = useAdminCurrency();
  const [tab, setTab] = useState("packages");
  const [search, setSearch] = useState("");
  const [filterCountry, setFilterCountry] = useState("all");
  const [filterTarget, setFilterTarget] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editPkg, setEditPkg] = useState<PkgData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PkgData | null>(null);
  const [cloneTarget, setCloneTarget] = useState<PkgData | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showDisableAll, setShowDisableAll] = useState(false);

  const { data: packages = [], isLoading } = useQuery<PkgData[]>({
    queryKey: ["/api/admin/packages"],
  });

  const { data: purchasesData } = useQuery<{ purchases: UserPurchase[]; total: number }>({
    queryKey: ["/api/admin/user-packages"],
    enabled: tab === "purchases",
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/packages/${id}`);
      if (res.status === 409) {
        const body = await res.json();
        throw new Error(body.message ?? "Cannot delete — package has subscribers");
      }
    },
    onSuccess: () => { toast({ title: "Package deleted" }); qc.invalidateQueries({ queryKey: ["/api/admin/packages"] }); setDeleteTarget(null); },
    onError: (e: any) => toast({ title: e?.message ?? "Failed to delete", variant: "destructive", duration: 7000 }),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/packages/${id}/clone`, {}),
    onSuccess: () => { toast({ title: "Package cloned" }); qc.invalidateQueries({ queryKey: ["/api/admin/packages"] }); setCloneTarget(null); },
    onError: (e: any) => toast({ title: e?.message ?? "Failed to clone", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/packages/${id}`, { isActive }),
    onSuccess: (_data, vars) => {
      toast({ title: vars.isActive ? "Package restored — now visible to new users" : "Package archived — existing subscribers keep access" });
      qc.invalidateQueries({ queryKey: ["/api/admin/packages"] });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  const disableAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/packages/disable-all-active", {}).then(r => r.json()),
    onSuccess: (data: { disabled: number }) => {
      toast({ title: `${data.disabled} package${data.disabled !== 1 ? "s" : ""} disabled — existing subscribers keep access until expiry` });
      qc.invalidateQueries({ queryKey: ["/api/admin/packages"] });
      setShowDisableAll(false);
    },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  const activeCount = packages.filter(p => p.isActive).length;

  const filtered = useMemo(() => {
    return packages.filter(p => {
      if (search && !(p.name + (p.description ?? "")).toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCountry !== "all") {
        if (filterCountry === "global" && p.countryCode != null) return false;
        if (filterCountry !== "global" && p.countryCode !== filterCountry) return false;
      }
      if (filterTarget !== "all" && p.targetUserType !== filterTarget && p.targetUserType !== "both") return false;
      return true;
    });
  }, [packages, search, filterCountry, filterTarget]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, filterCountry, filterTarget]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id));
  const someSelected = selectedIds.size > 0;

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  }

  async function bulkSetActive(isActive: boolean) {
    setBulkLoading(true);
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map(id => apiRequest("PATCH", `/api/admin/packages/${id}`, { isActive })));
      toast({ title: `${ids.length} package${ids.length > 1 ? "s" : ""} ${isActive ? "restored" : "archived"} — existing subscribers unaffected` });
      qc.invalidateQueries({ queryKey: ["/api/admin/packages"] });
      setSelectedIds(new Set());
    } catch (e: any) {
      toast({ title: e?.message ?? "Bulk action failed", variant: "destructive" });
    } finally {
      setBulkLoading(false);
    }
  }

  const stats = useMemo(() => ({
    total:    packages.length,
    active:   packages.filter(p => p.isActive).length,
    patient:  packages.filter(p => p.targetUserType === "patient" || p.targetUserType === "both").length,
    provider: packages.filter(p => p.targetUserType === "provider" || p.targetUserType === "both").length,
    purchases: purchasesData?.total ?? 0,
  }), [packages, purchasesData]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Packages",    value: stats.total,    icon: ShoppingBag },
          { label: "Active",            value: stats.active,   icon: CheckCircle },
          { label: "Patient Packages",  value: stats.patient,  icon: Users },
          { label: "Provider Packages", value: stats.provider, icon: Shield },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <s.icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-2xl font-bold tabular-nums" data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="packages" data-testid="tab-pkg-list">Packages</TabsTrigger>
          <TabsTrigger value="purchases" data-testid="tab-pkg-purchases">Purchases</TabsTrigger>
        </TabsList>

        {/* ── Packages list ── */}
        <TabsContent value="packages" className="pt-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Search packages…"
                className="w-48"
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-pkg-search"
              />
              <Select value={filterCountry} onValueChange={setFilterCountry}>
                <SelectTrigger className="w-36" data-testid="select-filter-country">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="HU">Hungary</SelectItem>
                  <SelectItem value="IR">Iran</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterTarget} onValueChange={setFilterTarget}>
                <SelectTrigger className="w-36" data-testid="select-filter-target">
                  <SelectValue placeholder="Target" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="patient">Clients</SelectItem>
                  <SelectItem value="provider">Providers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              {activeCount > 0 && (
                <Button
                  variant="outline"
                  className="border-destructive/50 text-destructive hover:bg-destructive/5 hover:text-destructive"
                  onClick={() => setShowDisableAll(true)}
                  data-testid="button-disable-all-active"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Disable All Active ({activeCount})
                </Button>
              )}
              <Button onClick={() => { setEditPkg(null); setShowForm(true); }} data-testid="button-create-package">
                <Plus className="h-4 w-4 mr-1.5" /> New Package
              </Button>
            </div>
          </div>

          {/* ── Bulk action toolbar ── */}
          {someSelected && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-primary/5 border-primary/20" data-testid="bulk-toolbar">
              <SquareCheck className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-primary">{selectedIds.size} selected</span>
              <div className="flex items-center gap-2 ml-2">
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => bulkSetActive(false)}
                  disabled={bulkLoading}
                  data-testid="button-bulk-archive"
                >
                  <Archive className="h-3.5 w-3.5 mr-1" />
                  Archive {selectedIds.size > 1 ? `${selectedIds.size} packages` : "package"}
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                  onClick={() => bulkSetActive(true)}
                  disabled={bulkLoading}
                  data-testid="button-bulk-restore"
                >
                  <ArchiveRestore className="h-3.5 w-3.5 mr-1" />
                  Restore {selectedIds.size > 1 ? `${selectedIds.size} packages` : "package"}
                </Button>
              </div>
              <Button
                size="sm" variant="ghost"
                className="h-7 text-xs ml-auto text-muted-foreground"
                onClick={() => setSelectedIds(new Set())}
                data-testid="button-clear-selection"
              >
                Clear
              </Button>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 pl-4">
                        <Checkbox
                          checked={allFilteredSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Benefits</TableHead>
                      <TableHead>Purchases</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                    )}
                    {!isLoading && filtered.length === 0 && (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No packages found.</TableCell></TableRow>
                    )}
                    {filtered.map(pkg => (
                      <TableRow key={pkg.id} data-testid={`row-pkg-${pkg.id}`} className={`${!pkg.isActive ? "opacity-60" : ""} ${selectedIds.has(pkg.id) ? "bg-primary/5" : ""}`}>
                        <TableCell className="pl-4">
                          <Checkbox
                            checked={selectedIds.has(pkg.id)}
                            onCheckedChange={() => toggleSelect(pkg.id)}
                            aria-label={`Select ${pkg.name}`}
                            data-testid={`checkbox-pkg-${pkg.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{pkg.name}</p>
                            {pkg.description && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{pkg.description}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {pkg.countryCode
                            ? <span className="flex items-center gap-1 text-xs"><MapPin className="h-3 w-3" />{pkg.countryCode}</span>
                            : <span className="flex items-center gap-1 text-xs text-muted-foreground"><Globe className="h-3 w-3" />Global</span>
                          }
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{pkg.targetUserType}</Badge>
                        </TableCell>
                        <TableCell className="font-medium text-sm tabular-nums">
                          {Number(pkg.price) === 0 ? <span className="text-green-600">Free</span> : fmtMoney(pkg.price)}
                        </TableCell>
                        <TableCell className="text-sm">{pkg.durationDays}d</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {pkg.benefits.length === 0
                              ? <span className="text-xs text-muted-foreground">None</span>
                              : pkg.benefits.map((b, i) => {
                                  const meta = BENEFIT_KEYS.find(bk => bk.key === b.benefitKey);
                                  return (
                                    <span key={i} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                                      {meta?.label.split(" ")[0] ?? b.benefitKey}: {b.benefitValue}{meta?.unit === "%" ? "%" : ""}
                                    </span>
                                  );
                                })
                            }
                          </div>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">{pkg.purchaseCount ?? 0}{pkg.maxPurchases ? `/${pkg.maxPurchases}` : ""}</TableCell>
                        <TableCell>
                          {pkg.isActive
                            ? <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">Active</Badge>
                            : <Badge variant="outline" className="text-xs text-muted-foreground">Archived</Badge>
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => { setEditPkg(pkg); setShowForm(true); }} data-testid={`button-edit-pkg-${pkg.id}`} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setCloneTarget(pkg)} data-testid={`button-clone-pkg-${pkg.id}`} title="Clone">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            {pkg.isActive ? (
                              <Button
                                size="sm" variant="ghost"
                                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                onClick={() => toggleActiveMutation.mutate({ id: pkg.id, isActive: false })}
                                data-testid={`button-archive-pkg-${pkg.id}`}
                                title="Archive (hides from catalog, keeps user access)"
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button
                                size="sm" variant="ghost"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => toggleActiveMutation.mutate({ id: pkg.id, isActive: true })}
                                data-testid={`button-restore-pkg-${pkg.id}`}
                                title="Restore (make visible again)"
                              >
                                <ArchiveRestore className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(pkg)} data-testid={`button-delete-pkg-${pkg.id}`} title="Delete permanently">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Purchases tab ── */}
        <TabsContent value="purchases" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">User Purchases</CardTitle>
              <CardDescription>All package purchases and their current status.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead>Price Paid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Purchased</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!purchasesData && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
                    {purchasesData?.purchases.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No purchases yet.</TableCell></TableRow>}
                    {purchasesData?.purchases.map(p => (
                      <TableRow key={p.id} data-testid={`row-purchase-${p.id}`}>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{p.user_name}</p>
                            <p className="text-xs text-muted-foreground">{p.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{p.package_name}</TableCell>
                        <TableCell className="text-sm tabular-nums">{Number(p.price_paid) === 0 ? "Free" : fmtMoney(p.price_paid)}</TableCell>
                        <TableCell>{statusBadge(p.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(p.purchased_at)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(p.expires_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {purchasesData && (
                <div className="px-4 py-3 border-t text-xs text-muted-foreground">
                  Showing {purchasesData.purchases.length} of {purchasesData.total} purchases
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Form dialog */}
      <PackageFormDialog
        open={showForm}
        initial={editPkg}
        onClose={() => { setShowForm(false); setEditPkg(null); }}
        onSaved={() => { setShowForm(false); setEditPkg(null); }}
      />

      {/* Disable All Active confirm */}
      <AlertDialog open={showDisableAll} onOpenChange={v => { if (!v) setShowDisableAll(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Disable All Active Packages
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will disable all <strong>{activeCount} active package{activeCount !== 1 ? "s" : ""}</strong> at once.
                  They will be hidden from the catalog and no new purchases can be made.
                </p>
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 flex gap-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    Existing subscribers keep their benefits until their package expires. This action does not cancel any active subscriptions.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => disableAllMutation.mutate()}
              disabled={disableAllMutation.isPending}
              data-testid="button-confirm-disable-all"
            >
              {disableAllMutation.isPending ? "Disabling…" : `Disable All ${activeCount} Package${activeCount !== 1 ? "s" : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clone confirm */}
      <AlertDialog open={!!cloneTarget} onOpenChange={v => { if (!v) setCloneTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clone Package</AlertDialogTitle>
            <AlertDialogDescription>
              Create a copy of <strong>{cloneTarget?.name}</strong>? The clone will be inactive by default.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => cloneTarget && cloneMutation.mutate(cloneTarget.id)} data-testid="button-confirm-clone">Clone</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Package</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Permanently delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
                </p>
                {deleteTarget && (deleteTarget.purchaseCount ?? 0) > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 flex gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
                      <p className="font-semibold">{deleteTarget.purchaseCount} user{(deleteTarget.purchaseCount ?? 0) > 1 ? "s have" : " has"} purchased this package.</p>
                      <p>Deleting is blocked — use <strong>Archive</strong> instead. Archived packages are hidden from the catalog but existing subscribers keep their access until expiry.</p>
                    </div>
                  </div>
                )}
                {deleteTarget && (deleteTarget.purchaseCount ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">No users have purchased this package — it is safe to delete.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {deleteTarget && (deleteTarget.purchaseCount ?? 0) > 0 ? (
              <AlertDialogAction
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => {
                  if (deleteTarget) {
                    toggleActiveMutation.mutate({ id: deleteTarget.id, isActive: false });
                    setDeleteTarget(null);
                  }
                }}
                data-testid="button-archive-instead"
              >
                <Archive className="h-4 w-4 mr-1.5" /> Archive Instead
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete-pkg"
              >
                Delete Permanently
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
