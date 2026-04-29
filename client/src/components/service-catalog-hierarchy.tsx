import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, ChevronRight, ChevronDown, Plus, Edit2, Trash2, Check, X,
  FolderOpen, Folder, Tag, DollarSign, Clock, Percent, ListTree,
  RotateCcw, Archive, Layers,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────── */
/*  Types                                                             */
/* ────────────────────────────────────────────────────────────────── */
interface Category {
  id: string; slug: string; name: string; description?: string | null;
  icon?: string | null; sortOrder?: number; isActive?: boolean; deletedAt?: string | null;
}
interface CatalogService {
  id: string; categoryId?: string | null; name: string; description?: string | null;
  icon?: string | null; sortOrder?: number; isActive?: boolean; deletedAt?: string | null;
}
interface SubService {
  id: string; category: string; catalogServiceId?: string | null; name: string;
  description?: string | null; basePrice?: string; platformFee?: string;
  durationMinutes?: number; taxPercentage?: string; pricingType?: string;
  isActive?: boolean; deletedAt?: string | null;
}

/* ────────────────────────────────────────────────────────────────── */
/*  Inline forms                                                      */
/* ────────────────────────────────────────────────────────────────── */
const EMPTY_SUB = { name: "", basePrice: "0.00", platformFee: "0.00", durationMinutes: 30, taxPercentage: "0.00", pricingType: "fixed" as string };
const EMPTY_CAT = { name: "", slug: "", description: "", icon: "", sortOrder: 0 };
const EMPTY_CS  = { name: "", description: "", icon: "" };

function SubServiceForm({ initial, onSave, onCancel, isSaving, testPrefix }: {
  initial: typeof EMPTY_SUB; onSave: (d: typeof EMPTY_SUB) => void;
  onCancel: () => void; isSaving: boolean; testPrefix: string;
}) {
  const [d, setD] = useState(initial);
  return (
    <div className="bg-muted/40 rounded-lg border border-dashed border-primary/30 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <div className="lg:col-span-2">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Name</label>
          <Input value={d.name} onChange={e => setD({ ...d, name: e.target.value })} placeholder="e.g. Manual Therapy" data-testid={`${testPrefix}-name`} />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Base price</label>
          <Input type="number" step="0.01" min="0" value={d.basePrice} onChange={e => setD({ ...d, basePrice: e.target.value })} data-testid={`${testPrefix}-base`} />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Platform fee</label>
          <Input type="number" step="0.01" min="0" value={d.platformFee} onChange={e => setD({ ...d, platformFee: e.target.value })} data-testid={`${testPrefix}-fee`} />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Duration (min)</label>
          <Input type="number" min="5" value={d.durationMinutes} onChange={e => setD({ ...d, durationMinutes: parseInt(e.target.value) || 0 })} data-testid={`${testPrefix}-dur`} />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Tax %</label>
          <Input type="number" step="0.01" min="0" max="100" value={d.taxPercentage} onChange={e => setD({ ...d, taxPercentage: e.target.value })} data-testid={`${testPrefix}-tax`} />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Pricing type</label>
          <Select value={d.pricingType} onValueChange={v => setD({ ...d, pricingType: v })}>
            <SelectTrigger data-testid={`${testPrefix}-type`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed</SelectItem>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="session">Per Session</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} data-testid={`${testPrefix}-cancel`}><X className="h-3 w-3 mr-1" /> Cancel</Button>
        <Button size="sm" disabled={!d.name.trim() || isSaving} onClick={() => onSave(d)} data-testid={`${testPrefix}-save`}>
          {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />} Save
        </Button>
      </div>
    </div>
  );
}

function CatalogServiceForm({ initial, onSave, onCancel, isSaving, testPrefix }: {
  initial: typeof EMPTY_CS; onSave: (d: typeof EMPTY_CS) => void;
  onCancel: () => void; isSaving: boolean; testPrefix: string;
}) {
  const [d, setD] = useState(initial);
  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-dashed border-amber-400/40 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Service group name</label>
          <Input value={d.name} onChange={e => setD({ ...d, name: e.target.value })} placeholder="e.g. Sports Recovery" data-testid={`${testPrefix}-name`} />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Icon (emoji)</label>
          <Input value={d.icon || ""} onChange={e => setD({ ...d, icon: e.target.value })} placeholder="🏃" data-testid={`${testPrefix}-icon`} />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Description (optional)</label>
        <Input value={d.description || ""} onChange={e => setD({ ...d, description: e.target.value })} placeholder="Brief description" data-testid={`${testPrefix}-desc`} />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}><X className="h-3 w-3 mr-1" /> Cancel</Button>
        <Button size="sm" disabled={!d.name.trim() || isSaving} onClick={() => onSave(d)}>
          {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />} Add service group
        </Button>
      </div>
    </div>
  );
}

function CategoryForm({ initial, onSave, onCancel, isSaving, testPrefix }: {
  initial: typeof EMPTY_CAT; onSave: (d: typeof EMPTY_CAT) => void;
  onCancel: () => void; isSaving: boolean; testPrefix: string;
}) {
  const [d, setD] = useState(initial);
  const autoSlug = (n: string) => n.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (
    <div className="bg-primary/5 rounded-lg border border-dashed border-primary/40 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Category name</label>
          <Input value={d.name} onChange={e => { const n = e.target.value; setD({ ...d, name: n, slug: d.slug || autoSlug(n) }); }} placeholder="e.g. Cardiology" data-testid={`${testPrefix}-name`} />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Slug</label>
          <Input value={d.slug} onChange={e => setD({ ...d, slug: e.target.value })} placeholder="auto-generated" data-testid={`${testPrefix}-slug`} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Description</label>
          <Input value={d.description} onChange={e => setD({ ...d, description: e.target.value })} placeholder="Brief description" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Icon (emoji)</label>
          <Input value={d.icon} onChange={e => setD({ ...d, icon: e.target.value })} placeholder="🩺" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}><X className="h-3 w-3 mr-1" /> Cancel</Button>
        <Button size="sm" disabled={!d.name.trim() || !d.slug.trim() || isSaving} onClick={() => onSave(d)} data-testid={`${testPrefix}-save`}>
          {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />} Save category
        </Button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Main component                                                    */
/* ────────────────────────────────────────────────────────────────── */
export function ServiceCatalogHierarchy() {
  useTranslation();
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();

  const [expandedCat, setExpandedCat]   = useState<Record<string, boolean>>({});
  const [expandedCs,  setExpandedCs]    = useState<Record<string, boolean>>({});

  const [addingCat, setAddingCat]       = useState(false);
  const [editingCat, setEditingCat]     = useState<Category | null>(null);
  const [deletingCat, setDeletingCat]   = useState<Category | null>(null);

  const [addingCsFor,  setAddingCsFor]  = useState<string | null>(null);  // categoryId
  const [editingCs,    setEditingCs]    = useState<CatalogService | null>(null);
  const [deletingCs,   setDeletingCs]   = useState<CatalogService | null>(null);

  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);  // csId or catSlug
  const [editingSub,   setEditingSub]   = useState<SubService | null>(null);
  const [deletingSub,  setDeletingSub]  = useState<SubService | null>(null);

  /* ── Queries ── */
  const { data: categories = [], refetch: refetchCats } = useQuery<Category[]>({ queryKey: ["/api/admin/categories"] });
  const { data: csAll = [],      refetch: refetchCs   } = useQuery<CatalogService[]>({ queryKey: ["/api/admin/catalog-services"] });
  const { data: subs = [],       refetch: refetchSubs } = useQuery<SubService[]>({ queryKey: ["/api/admin/sub-services"] });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/catalog-services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/sub-services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    queryClient.invalidateQueries({ queryKey: ["/api/catalog-services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sub-services"] });
  };

  /* ── Mutations ── */
  const mkMut = (method: string, url: string | ((d: any) => string), onOk: () => void) =>
    useMutation({
      mutationFn: (d: any) => apiRequest(method, typeof url === "function" ? url(d) : url, typeof url === "function" ? undefined : d),
      onSuccess: () => { onOk(); invalidate(); },
      onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }),
    });

  const createCat  = mkMut("POST",  "/api/admin/categories",                          () => { setAddingCat(false);  refetchCats(); });
  const updateCat  = useMutation({ mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/admin/categories/${id}`, data), onSuccess: () => { setEditingCat(null); refetchCats(); invalidate(); } });
  const deleteCat  = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/categories/${id}`), onSuccess: () => { setDeletingCat(null); refetchCats(); invalidate(); } });
  const toggleCat  = useMutation({ mutationFn: ({ id, v }: any) => apiRequest("PATCH", `/api/admin/categories/${id}`, { isActive: v }), onSuccess: () => { refetchCats(); invalidate(); } });

  const createCs   = useMutation({ mutationFn: (d: any) => apiRequest("POST",  "/api/admin/catalog-services",  d), onSuccess: () => { setAddingCsFor(null);  refetchCs(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });
  const updateCs   = useMutation({ mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/admin/catalog-services/${id}`, data), onSuccess: () => { setEditingCs(null); refetchCs(); invalidate(); } });
  const deleteCs   = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/catalog-services/${id}`), onSuccess: () => { setDeletingCs(null); refetchCs(); invalidate(); } });
  const toggleCs   = useMutation({ mutationFn: ({ id, v }: any) => apiRequest("PATCH", `/api/admin/catalog-services/${id}`, { isActive: v }), onSuccess: () => { refetchCs(); invalidate(); } });

  const createSub  = useMutation({ mutationFn: (d: any) => apiRequest("POST",  "/api/admin/sub-services",  d), onSuccess: () => { setAddingSubFor(null); refetchSubs(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });
  const updateSub  = useMutation({ mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/admin/sub-services/${id}`, data), onSuccess: () => { setEditingSub(null); refetchSubs(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });
  const deleteSub  = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/sub-services/${id}`), onSuccess: () => { setDeletingSub(null); refetchSubs(); invalidate(); } });
  const toggleSub  = useMutation({ mutationFn: ({ id, v }: any) => apiRequest("PATCH", `/api/admin/sub-services/${id}`, { isActive: v }), onSuccess: () => { refetchSubs(); invalidate(); } });
  const restoreSub = useMutation({ mutationFn: (id: string) => apiRequest("POST", `/api/sub-services/${id}/restore`), onSuccess: () => { refetchSubs(); invalidate(); } });

  /* ── Grouping ── */
  const sortedCats = useMemo(() => [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [categories]);
  const csByCat  = useMemo(() => {
    const m: Record<string, CatalogService[]> = {};
    for (const cs of csAll) { (m[cs.categoryId || ""] ||= []).push(cs); }
    return m;
  }, [csAll]);
  const subsByCs = useMemo(() => {
    const m: Record<string, SubService[]> = {};
    for (const s of subs) { (m[s.catalogServiceId || `__cat__${s.category}`] ||= []).push(s); }
    return m;
  }, [subs]);

  /* ── Sub-service row ── */
  const renderSubRow = (s: SubService, isLast: boolean) => {
    if (editingSub?.id === s.id) {
      return (
        <div key={s.id} className="p-3 border-b">
          <SubServiceForm
            initial={{ name: s.name, basePrice: s.basePrice || "0.00", platformFee: s.platformFee || "0.00", durationMinutes: s.durationMinutes || 30, taxPercentage: s.taxPercentage || "0.00", pricingType: (s.pricingType || "fixed") as any }}
            onSave={d => updateSub.mutate({ id: s.id, data: d })}
            onCancel={() => setEditingSub(null)}
            isSaving={updateSub.isPending}
            testPrefix={`edit-sub-${s.id}`}
          />
        </div>
      );
    }
    return (
      <div key={s.id} className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/20 transition-colors ${!isLast ? "border-b" : ""}`} data-testid={`sub-row-${s.id}`}>
        <div className="flex items-center gap-1 shrink-0 pl-4">
          <Tag className="h-3.5 w-3.5 text-muted-foreground/60" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm" data-testid={`text-sub-name-${s.id}`}>{s.name}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{s.pricingType || "fixed"}</Badge>
            {!s.isActive && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Inactive</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-3 mt-0.5">
            <span className="text-xs text-muted-foreground flex items-center gap-0.5"><DollarSign className="h-3 w-3" />Base: <span className="font-medium text-foreground ml-0.5">{fmtMoney(s.basePrice)}</span></span>
            <span className="text-xs text-muted-foreground flex items-center gap-0.5"><DollarSign className="h-3 w-3" />Fee: <span className="font-medium text-foreground ml-0.5">{fmtMoney(s.platformFee)}</span></span>
            <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Clock className="h-3 w-3" /><span className="font-medium text-foreground">{s.durationMinutes}m</span></span>
            <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Percent className="h-3 w-3" />Tax: <span className="font-medium text-foreground ml-0.5">{Number(s.taxPercentage)}%</span></span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Switch checked={!!s.isActive} onCheckedChange={v => toggleSub.mutate({ id: s.id, v })} data-testid={`switch-sub-${s.id}`} />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingSub(s)} data-testid={`button-edit-sub-${s.id}`}><Edit2 className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingSub(s)} data-testid={`button-delete-sub-${s.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    );
  };

  /* ── CatalogService section ── */
  const renderCatalogService = (cs: CatalogService, cat: Category, isLastCs: boolean) => {
    const isOpen = !!expandedCs[cs.id];
    const csKey  = cs.id;
    const csSubs = (subsByCs[csKey] || []).filter(s => !s.deletedAt);
    const csArchived = (subsByCs[csKey] || []).filter(s => !!s.deletedAt);
    const isEditing  = editingCs?.id === cs.id;

    return (
      <div key={cs.id} className={`mx-3 mb-2 rounded-lg border bg-muted/10 ${isLastCs ? "" : ""}`} data-testid={`cs-row-${cs.id}`}>
        {isEditing ? (
          <div className="p-2">
            <CatalogServiceForm
              initial={{ name: cs.name, description: cs.description || "", icon: cs.icon || "" }}
              onSave={d => updateCs.mutate({ id: cs.id, data: d })}
              onCancel={() => setEditingCs(null)}
              isSaving={updateCs.isPending}
              testPrefix={`edit-cs-${cs.id}`}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/30 transition-colors">
            <button type="button" onClick={() => setExpandedCs(s => ({ ...s, [cs.id]: !s[cs.id] }))} className="flex items-center gap-1.5 flex-1 min-w-0 text-left" data-testid={`button-toggle-cs-${cs.id}`}>
              {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-amber-600 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              <Layers className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              {cs.icon && <span className="text-sm">{cs.icon}</span>}
              <span className="font-medium text-sm">{cs.name}</span>
              {!cs.isActive && <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">Inactive</Badge>}
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{csSubs.length}</Badge>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <Switch checked={!!cs.isActive} onCheckedChange={v => toggleCs.mutate({ id: cs.id, v })} data-testid={`switch-cs-${cs.id}`} />
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingCs(cs)}><Edit2 className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeletingCs(cs)}><Trash2 className="h-3 w-3" /></Button>
              <Button size="sm" variant="outline" className="h-6 text-xs px-1.5" onClick={() => { setAddingSubFor(cs.id); setExpandedCs(s => ({ ...s, [cs.id]: true })); }} data-testid={`button-add-sub-${cs.id}`}>
                <Plus className="h-3 w-3 mr-0.5" /> Sub
              </Button>
            </div>
          </div>
        )}
        {isOpen && !isEditing && (
          <div className="border-t mx-0">
            {addingSubFor === cs.id && (
              <div className="p-2 border-b">
                <SubServiceForm
                  initial={EMPTY_SUB}
                  onSave={d => createSub.mutate({ ...d, category: cat.slug, catalogServiceId: cs.id })}
                  onCancel={() => setAddingSubFor(null)}
                  isSaving={createSub.isPending}
                  testPrefix={`new-sub-${cs.id}`}
                />
              </div>
            )}
            {csSubs.length === 0 && addingSubFor !== cs.id && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No sub-services.{" "}
                <button type="button" className="text-primary hover:underline" onClick={() => setAddingSubFor(cs.id)}>Add one.</button>
              </div>
            )}
            {csSubs.map((s, i) => renderSubRow(s, i === csSubs.length - 1 && csArchived.length === 0))}
            {csArchived.length > 0 && (
              <div className="px-3 py-2 border-t bg-muted/5">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Archive className="h-3 w-3" />{csArchived.length} archived</p>
                {csArchived.map(s => (
                  <div key={s.id} className="flex items-center gap-2 py-0.5 opacity-60">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground ml-5" />
                    <span className="text-xs line-through flex-1">{s.name}</span>
                    <Button size="sm" variant="outline" className="h-5 text-xs px-1.5" onClick={() => restoreSub.mutate(s.id)} disabled={restoreSub.isPending} data-testid={`button-restore-sub-${s.id}`}><RotateCcw className="h-2.5 w-2.5 mr-0.5" />Restore</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><ListTree className="h-5 w-5 text-primary" />Service Catalog</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Category → Service Group → Sub-service, with global pricing defaults.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{categories.length} categories</Badge>
          <Badge variant="secondary">{csAll.filter(c => !c.deletedAt).length} service groups</Badge>
          <Badge variant="secondary">{subs.filter(s => !s.deletedAt).length} sub-services</Badge>
          <Button size="sm" onClick={() => { setAddingCat(true); setEditingCat(null); }} disabled={addingCat} data-testid="button-add-category"><Plus className="h-4 w-4 mr-1" />Add Category</Button>
        </div>
      </div>

      {addingCat && (
        <CategoryForm initial={EMPTY_CAT} onSave={d => createCat.mutate(d)} onCancel={() => setAddingCat(false)} isSaving={createCat.isPending} testPrefix="new-cat" />
      )}

      {sortedCats.length === 0 && !addingCat ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
          <ListTree className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No categories yet</p>
          <p className="text-sm">Click "Add Category" to get started.</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="catalog-tree">
          {sortedCats.map(cat => {
            const isOpen = !!expandedCat[cat.id];
            const isEditing = editingCat?.id === cat.id;
            const catCss  = (csByCat[cat.id] || []).filter(c => !c.deletedAt);
            // Legacy sub-services that are in this category but have no catalog service
            const legacySubs = (subsByCs[`__cat__${cat.slug}`] || []).filter(s => !s.deletedAt);
            const legacyArchived = (subsByCs[`__cat__${cat.slug}`] || []).filter(s => !!s.deletedAt);
            const totalSubs = catCss.reduce((acc, cs) => acc + (subsByCs[cs.id] || []).filter(s => !s.deletedAt).length, 0) + legacySubs.length;

            return (
              <div key={cat.id} className={`rounded-xl border overflow-hidden ${cat.deletedAt ? "opacity-50" : "bg-card"}`} data-testid={`cat-row-${cat.id}`}>
                {/* Category row */}
                {isEditing ? (
                  <div className="p-3">
                    <CategoryForm initial={{ name: cat.name, slug: cat.slug, description: cat.description || "", icon: cat.icon || "", sortOrder: cat.sortOrder ?? 0 }} onSave={d => updateCat.mutate({ id: cat.id, data: d })} onCancel={() => setEditingCat(null)} isSaving={updateCat.isPending} testPrefix={`edit-cat-${cat.id}`} />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors">
                    <button type="button" onClick={() => setExpandedCat(s => ({ ...s, [cat.id]: !s[cat.id] }))} className="flex items-center gap-2 flex-1 min-w-0 text-left" data-testid={`button-toggle-cat-${cat.id}`}>
                      {isOpen ? <ChevronDown className="h-4 w-4 text-primary shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      {isOpen ? <FolderOpen className="h-4 w-4 text-primary shrink-0" /> : <Folder className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {cat.icon && <span className="text-base">{cat.icon}</span>}
                        <span className="font-semibold text-sm">{cat.name}</span>
                        <span className="text-xs text-muted-foreground font-mono hidden sm:inline">/{cat.slug}</span>
                        {cat.deletedAt && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Archived</Badge>}
                        {!cat.isActive && !cat.deletedAt && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Inactive</Badge>}
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{catCss.length} groups · {totalSubs} sub-services</Badge>
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <Switch checked={!!cat.isActive && !cat.deletedAt} disabled={!!cat.deletedAt} onCheckedChange={v => toggleCat.mutate({ id: cat.id, v })} data-testid={`switch-cat-${cat.id}`} />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingCat(cat); setExpandedCat(s => ({ ...s, [cat.id]: true })); }} data-testid={`button-edit-cat-${cat.id}`}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingCat(cat)} data-testid={`button-delete-cat-${cat.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => { setAddingCsFor(cat.id); setExpandedCat(s => ({ ...s, [cat.id]: true })); }} data-testid={`button-add-cs-${cat.id}`}><Plus className="h-3 w-3 mr-0.5" />Group</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => { setAddingSubFor(`__cat__${cat.slug}`); setExpandedCat(s => ({ ...s, [cat.id]: true })); }} data-testid={`button-add-sub-direct-${cat.id}`}><Plus className="h-3 w-3 mr-0.5" />Sub</Button>
                    </div>
                  </div>
                )}

                {/* Expanded body */}
                {isOpen && !isEditing && (
                  <div className="border-t pt-2 pb-1 space-y-1">
                    {/* Add catalog service inline form */}
                    {addingCsFor === cat.id && (
                      <div className="mx-3 mb-2">
                        <CatalogServiceForm initial={EMPTY_CS} onSave={d => createCs.mutate({ ...d, categoryId: cat.id })} onCancel={() => setAddingCsFor(null)} isSaving={createCs.isPending} testPrefix={`new-cs-${cat.id}`} />
                      </div>
                    )}

                    {/* Catalog service children */}
                    {catCss.length === 0 && legacySubs.length === 0 && addingCsFor !== cat.id && addingSubFor !== `__cat__${cat.slug}` && (
                      <div className="py-6 text-center text-sm text-muted-foreground mx-3">
                        No service groups yet.{" "}
                        <button type="button" className="text-primary hover:underline" onClick={() => setAddingCsFor(cat.id)}>Add a service group</button>
                        {" "}or{" "}
                        <button type="button" className="text-primary hover:underline" onClick={() => setAddingSubFor(`__cat__${cat.slug}`)}>add a sub-service directly</button>.
                      </div>
                    )}

                    {catCss.map((cs, i) => renderCatalogService(cs, cat, i === catCss.length - 1 && legacySubs.length === 0))}

                    {/* Legacy sub-services (no catalog service) */}
                    {(legacySubs.length > 0 || addingSubFor === `__cat__${cat.slug}`) && (
                      <div className="mx-3 rounded-lg border bg-muted/5">
                        <div className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground border-b">Ungrouped sub-services</div>
                        {addingSubFor === `__cat__${cat.slug}` && (
                          <div className="p-2 border-b">
                            <SubServiceForm initial={EMPTY_SUB} onSave={d => createSub.mutate({ ...d, category: cat.slug })} onCancel={() => setAddingSubFor(null)} isSaving={createSub.isPending} testPrefix={`new-sub-direct-${cat.id}`} />
                          </div>
                        )}
                        {legacySubs.map((s, i) => renderSubRow(s, i === legacySubs.length - 1 && legacyArchived.length === 0))}
                        {legacyArchived.length > 0 && (
                          <div className="px-3 py-2 border-t bg-muted/5">
                            {legacyArchived.map(s => (
                              <div key={s.id} className="flex items-center gap-2 py-0.5 opacity-60">
                                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs line-through flex-1">{s.name}</span>
                                <Button size="sm" variant="outline" className="h-5 text-xs px-1.5" onClick={() => restoreSub.mutate(s.id)} disabled={restoreSub.isPending}><RotateCcw className="h-2.5 w-2.5 mr-0.5" />Restore</Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete category dialog */}
      <AlertDialog open={!!deletingCat} onOpenChange={o => !o && setDeletingCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{deletingCat?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>If sub-services in this category are in use, it will be archived instead of permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingCat && deleteCat.mutate(deletingCat.id)} data-testid="button-confirm-delete-cat">
              {deleteCat.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete catalog service dialog */}
      <AlertDialog open={!!deletingCs} onOpenChange={o => !o && setDeletingCs(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove service group "{deletingCs?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Sub-services inside will become ungrouped, not deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingCs && deleteCs.mutate(deletingCs.id)}>
              {deleteCs.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete sub-service dialog */}
      <AlertDialog open={!!deletingSub} onOpenChange={o => !o && setDeletingSub(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{deletingSub?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>If assigned to providers or used in bookings, it will be archived instead of permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingSub && deleteSub.mutate(deletingSub.id)} data-testid="button-confirm-delete-sub">
              {deleteSub.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
